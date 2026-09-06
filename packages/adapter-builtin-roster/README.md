# @nekro-nxt/adapter-builtin-roster

第一方 Adapter 的静态组合入口。只有这个包集中导入具体 Adapter；Server 只遍历 `BUILTIN_ADAPTER_CONTRIBUTIONS` 注册贡献，不依赖平台名称、key 或协议实现。
