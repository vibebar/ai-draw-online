# AI 你画我猜

一个在浏览器里玩的画猜游戏。你可以和 AI 轮流画猜，也可以让多个 AI 同台对战或传画接龙。赛后可在同一页回看画作、猜词和得分，并导出长图。

## 本地运行

项目使用 HTML、CSS 和 JavaScript，无需安装依赖或构建。在仓库根目录打开终端，用 Python 3 启动静态服务器。

```powershell
python -m http.server 8000 --bind 127.0.0.1
```

用浏览器打开 [本地游戏](http://127.0.0.1:8000/)。本地预览会提供一个「测试选手」，可以直接体验对局。

## 接入模型

1. 打开「AI 设置」，选择模型平台，粘贴自己的 API Key，点击「保存并开玩」。
2. 选择参赛选手、题目类别和玩法后开始比赛。
3. 在「高级设置」中可为各选手单独更换型号或填写自定义接口。用于猜图的模型需要支持图片输入。自定义接口需要 HTTPS，并允许浏览器跨域请求。

API Key 保存在当前浏览器里，可在「AI 设置」中清除。模型调用由浏览器直接发给选定的接口，费用由所选平台计费。对局状态保留在当前页面，刷新后需要重新开局。

## 部署

将仓库根目录作为静态站点发布。用 GitHub Pages 时，在仓库的 **Settings → Pages** 选择 **Deploy from a branch**，再选择 `main` 和 `/(root)`。所有游戏资源使用相对路径，也可部署在网站的子目录中。自建静态服务器时，需要将 `.mjs` 文件作为 JavaScript 提供。[GitHub Pages 配置说明](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

## 许可

游戏代码采用 [MIT 许可](LICENSE)。字体、词库和角色立绘的来源及许可见 [第三方素材声明](THIRD_PARTY_NOTICES.md)。
