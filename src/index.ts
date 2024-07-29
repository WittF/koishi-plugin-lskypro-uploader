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
  logger.info(`🚀 插件已加载。调试模式：${config.debugMode ? '启用' : '禁用'}.`);

  ctx.command('wtf.upload', '上传图片到兰空图床')
    .action(async ({ session }) => {
      const key = `${session.userId}:${session.channelId || 'private'}`;
      activeUploads.set(key, true);
      logger.info(`📤 启动图片上传会话: 用户ID=${session.userId}, 频道ID=${session.channelId || '私聊'}`);
      return '📨 请发送图片';
    });

  ctx.middleware(async (session, next) => {
    const key = `${session.userId}:${session.channelId || 'private'}`;
    if (!activeUploads.get(key)) {
      return next();
    }

    const matches = session.content.match(/<img.*?src="([^"]+)"\s*file="([^"]+)"/);
    const imageUrl = matches ? matches[1].replace(/&amp;/g, '&') : null;
    const fileName = matches ? matches[2] : null;

    if (imageUrl && fileName) {
      const tempMessage = await session.send('🔄 正在上传图片...');
      try {
        const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        const contentType = response.headers['content-type'];
        let extension = contentType.split('/')[1];
        if (extension === 'jpeg') extension = 'jpg';

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
        return session.send(`🎉 图片上传成功：${uploadedUrl}`);
      } catch (error) {
        await session.bot.deleteMessage(session.channelId, tempMessage[0]);
        logger.error(`🚨 上传图片时发生错误: ${error}`);
        activeUploads.delete(key);
        return session.send('❌ 上传图片时出错。');
      }
    }
    return next();
  });
}
