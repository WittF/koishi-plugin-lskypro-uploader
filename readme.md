# koishi-plugin-lskypro-uploader

[![npm](https://img.shields.io/npm/v/koishi-plugin-lskypro-uploader?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-lskypro-uploader)

通过 `lskybot.upload` 指令上传图片到 Lsky-Pro (兰空图床 V1)
Onebot🦥给我Qbot自用的🧩

## 功能

- 生成 Token：使用 `lskybot.token <email> <password>` 生成 Lsky-Pro API Token（仅限私聊）。
- 上传图片：使用 `lskybot.upload` 指令上传图片到 Lsky-Pro 图床，支持直接上传图片并返回直链及缩略图。

## 配置

- **apiUrl** Lsky-Pro API 地址
- **apiKey** API密钥
- **debugMode** 启用调试模式

## 指令

- `lskybot.token <email> <password>` - 生成 API Token（仅私聊）。
- `lskybot.upload` - 上传图片至 Lsky-Pro 图床。
- 
