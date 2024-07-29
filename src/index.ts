import { Context, Schema, Session } from 'koishi';
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
  console.log("[LskyPro Uploader] 插件已加载。");

  ctx.command('wtf.upload', '上传图片到兰空图床')
    .action(async ({ session }) => {
      const key = `${session.userId}:${session.channelId || 'private'}`;
      activeUploads.set(key, true);
      if (config.debugMode) console.log(`[LskyPro Uploader] 启动图片上传会话: ${key}`);
      return '请发送图片';
    });

  ctx.middleware(async (session, next) => {
    const key = `${session.userId}:${session.channelId || 'private'}`;
    if (!activeUploads.get(key)) {
      return next();
    }

    const matches = session.content.match(/<img.*?src="([^"]+)"/);
    const imageUrl = matches ? matches[1].replace(/&amp;/g, '&') : null;

    if (imageUrl) {
      if (config.debugMode) console.log(`[LskyPro Uploader] 检测到图片URL: ${imageUrl}`);
      const tempMessage = await session.send('正在上传图片...');
      try {
        const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        const contentType = response.headers['content-type'];
        let extension = contentType.split('/')[1];
        if (extension === 'jpeg') extension = 'jpg';

        const form = new FormData();
        form.append('file', response.data, { filename: `upload.${extension}` });

        const uploadResponse = await axios.post(`${config.apiUrl}/upload`, form, {
          headers: {
            'Authorization': `Bearer ${config.apiKey}`,
            ...form.getHeaders()
          }
        });

        const uploadedUrl = uploadResponse.data.data.links.url;
        console.log(`[LskyPro Uploader] 图片上传成功，URL: ${uploadedUrl}`);
        activeUploads.delete(key);
        await session.bot.deleteMessage(session.channelId, tempMessage[0]);
        return session.send(`图片上传成功：${uploadedUrl}`);
      } catch (error) {
        await session.bot.deleteMessage(session.channelId, tempMessage[0]);
        if (config.debugMode) console.error(`[LskyPro Uploader] 上传图片时发生错误:`, error);
        activeUploads.delete(key);
        return session.send('上传图片时出错。');
      }
    }
    return next();
  });
}
