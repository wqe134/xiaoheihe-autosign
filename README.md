# xiaoheihe-sign

小黑盒自动签到与日常任务脚本，支持多账号、任务完成状态校验、盒币/等级/盒电统计，以及青龙通知推送。

> 本项目仅供学习与个人自动化使用，请遵守小黑盒相关服务条款。脚本中的 Cookie、pkey、x_xhh_tokenid 属于敏感信息，请勿公开提交或分享。

## 功能

- 小黑盒每日签到
- 分享帖子任务
- 分享游戏详情任务
- 分享游戏评价任务
- 游戏榜单停留任务
- 自动读取任务列表并判断任务是否已完成
- 输出当前盒币、等级、盒电
- 支持多账号
- 支持青龙 `sendNotify` 通知


## 环境变量

脚本通过环境变量 `BLACKBOX_COOKIE` 读取账号信息。

格式：

```bash
export BLACKBOX_COOKIE="heybox_id#pkey=xxxxxx;x_xhh_tokenid=xxxxxx"
```

多账号使用 `&` 分隔：

```bash
export BLACKBOX_COOKIE="heybox_id1#pkey=xxxxxx;x_xhh_tokenid=xxxxxx&heybox_id2#pkey=xxxxxx;x_xhh_tokenid=xxxxxx"
```

字段说明：

| 字段 | 说明 |
|---|---|
| `heybox_id` | 请求参数中的小黑盒用户 ID |
| `pkey` | Cookie 中的 `pkey` |
| `x_xhh_tokenid` | Cookie 中的 `x_xhh_tokenid` |


## 注意事项

1. 请勿将真实 Cookie、pkey、x_xhh_tokenid 写入代码或提交到公开仓库。
2. 本脚本依赖第三方 hkey 服务：

   ```txt
   http://47.120.39.109:9900/hkey
   ```

   该服务来自公开脚本，非本项目作者本人搭建或维护。该服务会接收 `heyboxId`、任务类型和任务名，用于生成请求所需参数。使用前请自行评估风险，因使用该服务产生的任何后果由使用者自行承担。

3. 签到接口和日常任务接口使用的 App 版本参数不同：

   - 日常任务：`1.3.347 / build 916`
   - 签到任务：`1.3.332 / build 871`

   实测新版本参数执行签到任务可能不会发放奖励，因此签到接口单独保留旧版本参数；而其他日常任务使用旧版本参数无法正常完成，所以日常任务继续使用新版本参数。

4. 如果任务状态显示“未确认完成”，通常是接口延迟、任务标题规则变化或 hkey 服务异常导致。

## 免责声明

本项目仅供技术研究和个人学习使用。因使用本项目造成的账号异常、接口限制或其他后果，由使用者自行承担。
