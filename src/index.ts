import { Context, Schema, Session, Logger, h } from 'koishi';
import axios from 'axios';
import FormData from 'form-data';

export const name = 'lskypro-uploader';

export interface Config {
  apiUrl: string;
  apiKey: string;
  debugMode: boolean;
}

export const schema: Schema<Config> = Schema.object({
  apiUrl: Schema.string().description('Lsky-Pro API 地址'),
  apiKey: Schema.string().description('API 密钥'),
  debugMode: Schema.boolean().description('启用调试模式').default(false),
});

interface UploadSession {
  messageId: string; // 存储初始命令消息的 ID
}

const activeUploads = new Map<string, UploadSession>();
const UPLOAD_TIMEOUT = 5 * 60 * 1000; // 5分钟

export function apply(ctx: Context, config: Config) {
  const logger = new Logger('lskypro-uploader');
  if (config.debugMode) {
    logger.info(`🚀 插件已加载 调试模式已启用`);
  }

  ctx.command('lskybot.upload', '上传图片到兰空图床')
    .action(async ({ session }) => {
      const key = `${session.userId}:${session.channelId || 'private'}`;
      const messageId = session.messageId; // 获取初始命令消息的 ID
      activeUploads.set(key, { messageId });
      logger.info(`📤 启动图片上传会话 用户ID=${session.userId}, 频道ID=${session.channelId.startsWith('private:') ? '私聊' : session.channelId}`);

      // 设置超时自动取消上传会话
      setTimeout(async () => {
        if (activeUploads.has(key)) {
          const uploadSession = activeUploads.get(key);
          activeUploads.delete(key);
          const cancelMessage = session.channelId.startsWith('private:')
            ? [
                h.quote(uploadSession?.messageId || messageId),
                '⏰ 上传会话已超时，请重新尝试。'
              ]
            : [
                h.quote(uploadSession?.messageId || messageId),
                h.at(session.userId),
                '\n',
                '⏰ 上传会话已超时，请重新尝试。'
              ];
          await session.send(cancelMessage);
          logger.info(`⏰ 上传会话超时 用户ID=${session.userId}, 频道ID=${session.channelId.startsWith('private:') ? '私聊' : session.channelId}`);
        }
      }, UPLOAD_TIMEOUT);

      // 构建引用回复的提示消息
      const promptMessage = session.channelId.startsWith('private:')
        ? [
            h.quote(messageId),
            '📨 请发送图片'
          ]
        : [
            h.quote(messageId),
            h.at(session.userId),
            '\n',
            '📨 请发送图片'
          ];

      await session.send(promptMessage);
      return;
    });

  ctx.middleware(async (session, next) => {
    const key = `${session.userId}:${session.channelId || 'private'}`;
    if (!activeUploads.has(key)) {
      return next();
    }

    if (config.debugMode) {
      logger.info(`🔍 收到消息内容: ${session.content}`);
    }

    const matches = session.content.match(/<img.*?src="([^"]+)"[^>]*file="([^"]+)"[^>]*file-size="([^"]+)"/);
    const imageUrl = matches ? matches[1].replace(/&amp;/g, '&') : null;
    const fileName = matches ? matches[2] : null;
    const fileSize = matches ? matches[3] : null;

    if (imageUrl && fileName && fileSize) {
      const tempMessage = await session.send('🔄 正在上传图片，请稍候...');
      logger.info(`🔍 检测到文件名: ${fileName}, 大小: ${fileSize}, 图片URL: ${imageUrl} 正在上传...`);
      try {
        const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });

        const form = new FormData();
        form.append('file', response.data, { filename: fileName });

        const uploadResponse = await axios.post(`${config.apiUrl}/upload`, form, {
          headers: {
            'Authorization': `Bearer ${config.apiKey}`,
            ...form.getHeaders()
          }
        });

        const uploadedUrl = uploadResponse.data.data.links.url;
        const thumbnailUrl = uploadResponse.data.data.links.thumbnail_url || uploadedUrl; // 如果没有缩略图，使用原图
        logger.info(`✅ 图片上传成功，URL: ${uploadedUrl}`);

        const uploadSession = activeUploads.get(key);
        activeUploads.delete(key); // 删除会话

        // 删除临时消息
        await session.bot.deleteMessage(session.channelId, tempMessage[0]);

        // 判断消息类型（私聊或群组）
        const isPrivate = session.channelId.startsWith('private:');

        // 构建提及用户、引用消息并发送缩略图的消息
        const successMessage = isPrivate
          ? [
              h.quote(uploadSession?.messageId || session.messageId),
              '🎉 图片上传成功，直链：',
              uploadedUrl,
              '\n',
              h.image(thumbnailUrl)
            ]
          : [
              h.quote(uploadSession?.messageId || session.messageId),
              h.at(session.userId),
              '\n',
              '🎉 图片上传成功，直链：',
              uploadedUrl,
              '\n',
              h.image(thumbnailUrl)
            ];

        await session.send(successMessage);
        logger.info(`📤 图片上传会话结束 用户ID=${session.userId}, 频道ID=${isPrivate ? '私聊' : session.channelId}`);
      } catch (error) {
        await session.bot.deleteMessage(session.channelId, tempMessage[0]);
        logger.error(`🚨 上传图片时发生错误: ${error}`);
        const uploadSession = activeUploads.get(key);
        activeUploads.delete(key);

        // 判断消息类型（私聊或群组）
        const isPrivate = session.channelId.startsWith('private:');

        // 构建提及用户、引用消息并发送错误提示的消息
        const failureMessage = isPrivate
          ? [
              h.quote(uploadSession?.messageId || session.messageId),
              '❌ 上传图片时出错。请稍后再试。'
            ]
          : [
              h.quote(uploadSession?.messageId || session.messageId),
              h.at(session.userId),
              '\n',
              '❌ 上传图片时出错。请稍后再试。'
            ];

        await session.send(failureMessage);
        logger.info(`📤 图片上传会话结束 用户ID=${session.userId}, 频道ID=${isPrivate ? '私聊' : session.channelId}`);
      }
    } else {
      const uploadSession = activeUploads.get(key);
      activeUploads.delete(key);
      logger.warn(`⚠️ 未检测到有效的图片，消息内容: ${session.content}`);

      // 判断消息类型（私聊或群组）
      const isPrivate = session.channelId.startsWith('private:');

      // 构建提及用户、引用消息并发送未检测到图片的消息
      const noImageMessage = isPrivate
        ? [
            h.quote(uploadSession?.messageId || session.messageId),
            '⚠️ 未检测到有效的图片。请确保发送的是图片。'
          ]
        : [
            h.quote(uploadSession?.messageId || session.messageId),
            h.at(session.userId),
            '\n',
            '⚠️ 未检测到有效的图片。请确保发送的是图片。'
          ];

      return session.send(noImageMessage);
    }
  });
}
