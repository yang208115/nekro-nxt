# Internal Web Adapter

内置频道通过本 Adapter 进入统一平台边界。它以 `system-singleton` Descriptor 声明 `internal` Channel，并通过 Runtime 的 `localChannel` 端口接收应用内消息。客户端提交的用户消息先规范化为 Adapter 入站事件并落入 Channel Event Log；智能体消息只有在统一通信工具创建 Outbox 后，才会经 `deliver()` 成为内置频道的已发送事实。内部包名和 Adapter key 只属于本包，不进入主应用分支或用户文案。

实时订阅只是 Outbox 提交后的通知，不是消息真源。没有浏览器在线时，发送仍可提交并由页面稍后从 Core 历史读取；模型原始文字永远不由本 Adapter 自动展示。
