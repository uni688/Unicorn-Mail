import app from './hono';
import '../security/security'

import '../api/email-api';
import '../api/user-api';
import '../api/login-api';
import '../api/setting-api';
import '../api/account-api';
import '../api/star-api';
import '../api/test-api';
import '../api/r2-api';
import '../api/resend-api';
import '../api/user-api';
import '../api/my-api';
import '../api/role-api'
import '../api/all-email-api'
import '../api/init-api'
import '../api/analysis-api'
import '../api/reg-key-api'
import '../api/public-api'
import '../api/telegram-api'
import '../api/oauth-api'
// P4（§5.3.5）：开发者中心的后台接口，走登录态 + 权限键
import '../api/api-key-api'
import '../api/api-log-api'
// P4（§0.10）：开放 API 的 Bearer 鉴权。**必须排在 `security/security` 之后** ——
// hono 按注册顺序执行中间件，`security` 的 `app.use('*')` 先跑（它把 /open 放进了
// exclude 直接 next()），随后这个 `app.use('/open/*')` 才做 Key 校验。
// 顺序反了的话 /open/* 会在 Key 校验之前先被要求 JWT
import '../security/api-key-auth'
import '../api/open-api'
export default app;
