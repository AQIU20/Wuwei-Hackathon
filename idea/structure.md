
**第一层：Host 服务**

这是整个系统的"神经中枢"。你需要在 PC 上跑一个常驻服务，它同时做几件事：

- 维持和所有硬件模块的连接（摄像头、传感器、执行器）
- 维护一张"在线模块表"，记录现在哪些模块在线、是什么类型、在哪个房间
- 把各种协议的数据（UDP、MQTT、WS）统一收进来，放到一个内部的数据总线上
- 对外提供接口，让 Agent 和 Aila 都能来访问

你可以把它想象成一个"智能家居路由器"，所有信号都经过它。

---

**第二层：Tool 封装**

Agent 不能直接"看到"摄像头，它只能调用函数。所以你需要把硬件能力翻译成函数。

每一个函数就是一个 Tool，分两类：

**读取类**（输入）：从硬件拿数据

- 拍一张照片（指定哪个摄像头）
- 读一个传感器的值（指定哪个传感器、读什么数据）
- 听一段语音并转成文字

**控制类**（输出）：向硬件发指令

- 让某个灯变色/变亮
- 让某个模块震动
- 让某个显示屏显示内容

这一层的关键是：每个 Tool 要有清晰的"描述"，因为 AI 要靠这个描述来决定什么时候该调用哪个 Tool。

---

**第三层：Agent Loop**

这是你最核心的工作，也是最有技术含量的部分。

逻辑很简单，是一个循环：

`用户说了一句话
    → 发给 LLM，告诉它现在有哪些 Tool 可用
    → LLM 决定要不要调用 Tool
    → 如果要，你去执行那个 Tool（真正去读摄像头/传感器）
    → 把结果告诉 LLM
    → LLM 再判断：够了吗？还需要更多信息吗？
    → 直到 LLM 说"我有答案了"
    → 把答案返回给用户`

这个循环可能转一圈就结束，也可能转好几圈。比如用户说"帮我检查一下家里空气"，LLM 可能依次调用客厅传感器、卧室传感器、厨房传感器，收集完所有数据才给出综合判断。

---

**第四层：对外接口**

你要给 Aila 队友提供两个接口：

**发现接口**：Aila 启动时来查询，"现在有哪些模块在线？" 你返回模块列表，Aila 才知道可以展示哪些能力给用户。

**对话接口**：用户在 Aila 上说了一句话，Aila 把它发给你，你跑 Agent Loop，跑完把结果返回给 Aila 展示。

---

**整个数据流完整走一遍**

以"厨房的猫在哪里"为例：

1. 用户在 Aila 上说"厨房的猫在哪里"
2. Aila 把这句话发给你的对话接口
3. 你的 Agent Loop 启动，把这句话 + 当前在线模块列表 + 所有 Tool 描述一起发给 LLM
4. LLM 判断：需要调用厨房摄像头的"拍照" Tool
5. 你真正去 Host 拿厨房摄像头的当前帧
6. 把图片发给 LLM，让它看图
7. LLM 看完图说：猫在沙发左边
8. 你把这个答案返回给 Aila
9. Aila 展示给用户

---

**黑客松里的优先级**

最先做：Host 服务跑通，能收到传感器数据，模块上线能感知到。

然后做：Tool 封装，至少做传感器读取和摄像头拍照。

然后做：Agent Loop，跑通一个完整的"用户问 → LLM 决策 → Tool 执行 → 回答"的循环。

最后做：对外接口，接上 Aila，让整个链路打通。

视觉（摄像头流）和语音（实时语音转文字）最复杂，放在最后，甚至 Demo 时可以用单帧截图代替实时流。

---

## 当前阶段性进展

这部分不是目标设计，而是当前仓库里已经落地的实现总结。

### 1. 真实硬件数据现在如何接进来

当前真实硬件入口已经统一为 MQTT。

- 服务在 `HARDWARE_MODE=mqtt` 时启用 MQTT bridge
- bridge 直接订阅 AI Hub 主题：
  - `aihub/status/#`
  - `aihub/sensor/#`
  - `aihub/event/#`
  - `aihub/resp/#`
- 浏览器通过 `/v1/hardware/ws` 只能订阅实时状态，不能再作为真实硬件写入口
- 服务会拒绝通过 WebSocket 直接写硬件状态

也就是说，现在真实世界的数据流是：

`硬件模块 -> MQTT Broker -> Railway 上的 Agent Server -> 内存状态 / Supabase`

MQTT 消息进入服务后，会同时走两条路径：

1. 写入 `HardwareStore`，更新当前内存里的实时状态
2. 规范化后写入 Supabase `hardware_events` 表

### 2. 现在数据库里存的是什么

当前已经落地了两类存储，不是一张表包打天下。

#### A. `hardware_events`

这是原始硬件事件流表，主要保存 MQTT ingress 进来的标准化事件。

每条记录大致包含：

- `msg_id`
- `topic`
- `scope`
- `subject`
- `type`
- `node_id`
- `node_type`
- `capability`
- `payload`
- `recorded_at`
- `status`
- `success`
- `confidence`

这张表的用途是：

- 保留真实 MQTT 消息的持久化记录
- 支持按 `msg_id`、`node_id`、`scope`、`type` 查询
- 支持排查“消息是否成功进入云端并被 ingest”

#### B. `hardware_history`

这是面向历史查询的快照表，不是原始事件表。

它存的是某个时间点系统中的 block 状态快照，每一行对应一个 block，payload 里可能带：

- `latest`
- `actuator`
- `scene`

这张表更适合回答：

- 某个模块最近一段时间的数据
- 最近有哪些状态变化
- 某个 capability 的历史样本

### 3. 数据如何写入 Supabase

#### A. MQTT -> `hardware_events`

现在 MQTT bridge 收到消息后，会先做 topic 和 payload 解析，再把 AI Hub envelope 规范化成一行事件记录，直接通过 Supabase REST API 写入 `hardware_events`。

链路可以理解为：

`MQTT message -> normalizeAihubMqttEnvelope -> HardwareEventService -> Supabase hardware_events`

这一层已经支持：

- 单条 envelope 写入
- 按 `msg_id` 读回单条事件
- 按 `node_id` / `capability` / `scope` / `type` / `minutes` 查询事件

#### B. 当前状态快照 -> `hardware_history`

服务端会维护一个 `HardwareStore` 作为实时内存状态。

在当前实现里，`SupabaseHistoryService` 会把 `HardwareStore` 的快照按 block 粒度写入 `hardware_history`，供后续趋势查询使用。

当前这部分已经能支持：

- 周期性写入快照
- 查询某个 block 的最近历史
- 查询某个 capability 的最近历史

### 4. Agent 现在如何使用 Supabase 数据生成答案

Agent 不是直接写 SQL，而是通过注册好的 tool 间接读取 Supabase。

当前已经接入的关键历史工具是：

- `get_hardware_history`

它的执行流程是：

1. 用户问一个涉及过去趋势或历史变化的问题
2. 模型判断需要历史数据
3. 调用 `get_hardware_history`
4. tool 内部调用 `SupabaseHistoryService.queryHistory(...)`
5. 从 Supabase `hardware_history` 取回样本
6. 把样本结果作为 tool 返回内容交回模型
7. 模型基于这些事实组织最终自然语言答案

所以现在“用数据库回答问题”的关键分工是：

- Supabase：保存事实
- tool：把事实取回来
- LLM：基于事实生成答案

### 5. 现在“每个硬件都做成一个 tool”做到哪了

这套机制已经搭起来了，但目前只完成了第一批真实设备中的灯。

当前代码里已经有一层设备级工具抽象：

- 每个真实设备可以定义成一个 `DeviceDefinition`
- 每个设备会被生成为一个专属 tool
- tool 名字固定为 `device_<blockId>`
- Agent 的 system prompt 会明确要求优先使用设备专属 tool，而不是泛化控制接口

这意味着后面继续扩设备时，不需要改 Agent 主体逻辑，只需要继续补设备定义和对应工具能力。

### 6. 当前灯块的 block 是什么

当前已经落地的真实设备是桌面上的灯，对应：

- `block_id = led_fd8480`
- `node_type = led`
- 在系统里被识别为：
  - `type = actuator`
  - `capability = light`

它目前已经有一个专属 tool：

- `device_led_fd8480`

这个 tool 的作用是：

- 接收自然语言意图映射出来的灯控动作
- 先更新内存里的 actuator state
- 再通过 MQTT bridge 发布到固件实际识别的主题

当前灯控制已经对接固件原生主题：

- `aihub/cmd/{nodeId}/ws2812`
- `aihub/cmd/{nodeId}/led`

并且已经支持的动作包括：

- `on`
- `off`
- `set_color`
- `set_pattern`

### 7. 现在这一阶段已经打通了什么

到当前为止，已经真实打通的能力是：

- 真实硬件通过 MQTT 进入 Railway Agent Server
- MQTT 消息可写入 Supabase `hardware_events`
- 服务端能把 MQTT 消息同步映射到内存态 `HardwareStore`
- 前端可通过 WebSocket 看实时硬件状态
- Agent 可通过 `get_hardware_history` 读取 Supabase 历史数据回答问题
- Agent 可通过设备专属 tool 控制灯 `led_fd8480`

### 8. 下一步最自然的扩展方向

如果要把这套能力继续做成稳定可扩展形态，最自然的下一步是：

- 把更多真实设备加入设备定义，而不只是一盏灯
- 给传感器设备也生成 device-specific tools
- 增加直接面向 `hardware_events` 的 agent tool
  这样 agent 可以直接回答“某条 MQTT 消息是否进入云端”“某个 msg_id 是否成功入库”
- 明确 `mqtt` 模式下 `hardware_history` 的持续落库策略
  让历史趋势查询与真实硬件入口保持一致
