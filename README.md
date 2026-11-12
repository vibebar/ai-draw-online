# AI 你画我猜

一个在浏览器里和 AI 玩的画猜游戏。你可以自己画，让 AI 猜，也可以看 AI 一笔一笔画出来，再猜它画的是什么。

这版精简了原项目的资源和功能，题库去重并筛选适合画猜的词条，角色动画改为体积更小的静态立绘，对局过程可以汇总成一张 PNG 长图。霞鹜文楷拆成了多个分片，浏览器只加载页面用到的分片，减少字体加载量。

想进一步了解玩法和项目背景，可以参考原项目的详细介绍。 [原项目 README](https://github.com/kirobani/ai-draw-guess#readme)

[点击在线试玩](https://vibebar.github.io/ai-draw-online/)，在浏览器里直接玩。

API Key 会保存在当前浏览器里，建议玩完关闭网页后，到创建 Key 的平台删除这把 Key。

## 玩法

- **单人对战**　你和一位 AI 轮流画、互相猜。
- **多人混战**　多位 AI 轮流作画和猜词，你可以参赛或观战。
- **传画接龙**　选手交替画图、猜词，结束后一起揭晓每条接龙。

赛后可以回看画作、猜词和结果，也可以导出 PNG 长图。

## 本地试玩

项目使用 HTML、CSS 和 JavaScript。用 Python 3 在项目根目录启动静态服务器即可。

```powershell
python -m http.server 8000 --bind 127.0.0.1
```

打开 [本地游戏](http://127.0.0.1:8000/)。本地提供「测试选手」，可以直接体验对局。

想和真实模型玩，打开「AI 设置」，选择平台，填入自己的 API Key，再点击「保存并开玩」。多人混战和传画接龙中，保存 OpenRouter Key 会自动勾选可用的内置 AI。你也可以在大厅调整名单。自定义接入的型号需要支持图片输入。

浏览器会直接请求所选接口，费用由模型平台计收。

## 来源与许可

本项目基于 kirobani 的 AI Draw & Guess 改编为纯前端静态版。 [原项目仓库](https://github.com/kirobani/ai-draw-guess)

- 原项目代码适用 MIT 许可，原版权声明和许可全文见 [LICENSE](LICENSE)。
- 本项目维护者拥有版权的新增代码和改动适用 WTFPL v2。 [LICENSE-WTFPL](LICENSE-WTFPL)
- 字体、词库和立绘按各自的许可发布。 [第三方素材声明](THIRD_PARTY_NOTICES.md)
