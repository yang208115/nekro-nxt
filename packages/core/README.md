# Core

该包拥有 NekroNXT 的产品事实与不可变版本语义：智能体、Connection、Channel、Binding、规范化 Channel Event 和独立 Connection Event。Connection 的 `alias` 是可选、trim 后最多 80 个字符的用户辨识名，不替换 Adapter 的平台身份。它不依赖具体聊天平台，不读取 DSH 私有存储，也不负责模型循环。

`CoreRepository` 是存储所有者必须实现的窄提交边界；领域服务只在 Repository 成功后返回已发布事实。首个实现位于 `storage-sqlite`。Channel Runtime、Asset Service 和 Extension 生命周期在各自垂直切片进入时复用这些稳定身份，不在 Core 中写平台特例。

智能体配置使用内容摘要去重的不可变 Revision；切换回历史内容时只重设当前 Revision 指针，不重复插入。一个智能体可以同时拥有多个有效 Binding；一个频道同一时间只有一个当前 Binding。换绑原子替换该频道的当前关系，不删除该频道已有消息。解绑先停止该频道活动 Episode（若有），再删除当前 Binding。

Channel Event 只保存具体频道的消息和活动；活动使用开放 `activityKey`。Connection Event 保存账号和关系层事实，按 Connection 与 `dedupeKey` 去重，可引用同一 Connection 的 actor/subject Platform Identity，并按时间游标分页。Connection Event 不属于 Channel，不创建成员，也不进入 Episode、Admission 或智能体上下文。

具体 Connection 使用 `activityTriggerDefaults` 保存频道活动默认值；Binding 使用 `activityTriggerOverrides` 布尔映射保存频道例外，缺失 key 表示跟随 Connection。保存时由组合根提供当前 Adapter Descriptor 校验；Channel Runtime 在实时触发和恢复时重新读取两层设置，并验证活动仍属于当前 Adapter、可触发且匹配 Channel kind。Adapter 缺失时已有 key 保留为休眠配置。

用户 Connection 可以归档后按原 ID 恢复，归档期间不进入活动查询，关联频道也不会被直接访问；Binding、消息、成员、事件和凭据引用保持不变。永久删除由 Repository 在停止运行后按 Connection 范围清理这些事实，系统单例不进入该流程。
