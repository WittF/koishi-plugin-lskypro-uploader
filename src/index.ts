import { Context, Schema, Session, Logger } from 'koishi';
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

const activeUploads = new Map();

export function apply(ctx: Context, config: Config) {
  const logger = new Logger('lskypro-uploader');
  if (config.debugMode) {
    logger.info(`🚀 插件已加载 调试模式已启用`);
  }

  ctx.command('lskybot.upload', '上传图片到兰空图床')
    .action(async ({ session }) => {
      const key = `${session.userId}:${session.channelId || 'private'}`;
      activeUploads.set(key, true);
      logger.info(`📤 启动图片上传会话 用户ID=${session.userId}, 频道ID=${session.channelId.startsWith('private:') ? '私聊' : session.channelId}`);
      return '📨 请发送图片';
    });

  ctx.middleware(async (session, next) => {
    const key = `${session.userId}:${session.channelId || 'private'}`;
    if (!activeUploads.get(key)) {
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
        logger.info(`✅ 图片上传成功，URL: ${uploadedUrl}`);
        activeUploads.delete(key);
        await session.bot.deleteMessage(session.channelId, tempMessage[0]);
        await session.send(`🎉 图片上传成功，直链：${uploadedUrl}`);
        logger.info(`📤 图片上传会话结束 用户ID=${session.userId}, 频道ID=${session.channelId.startsWith('private:') ? '私聊' : session.channelId}`);
      } catch (error) {
        await session.bot.deleteMessage(session.channelId, tempMessage[0]);
        logger.error(`🚨 上传图片时发生错误: ${error}`);
        activeUploads.delete(key);
        await session.send('❌ 上传图片时出错');
        logger.info(`📤 图片上传会话结束 用户ID=${session.userId}, 频道ID=${session.channelId.startsWith('private:') ? '私聊' : session.channelId}`);
      }
    } else {
      activeUploads.delete(key);
      logger.warn(`⚠️ 未检测到有效的图片，消息内容: ${session.content}`);
      return session.send('⚠️ 未检测到有效的图片');
    }
  });
}
