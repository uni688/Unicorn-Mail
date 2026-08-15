/**
 * 玻璃卡不透明度的下限（§5.3.1 对比度守卫 / §9.5 登录页 8 种组合过审）
 *
 * 常量放在这里而不是 GlassCard 里：登录页的下限跟「有没有站长背景图」有关，
 * 而 GlassCard 自己看不见背景图（它只知道自己被塞了个 alpha）。两个数字散在
 * 两个文件里迟早对不上，所以统一从这里读。
 *
 * 两个数字的来历（`/_ds#authcard` 上按 WCAG 公式实测，非拍脑袋）：
 * - 无背景图：卡片压在 `--um-bg-canvas` 上，0.55 时正文最差 5.44:1，够用。
 * - 有背景图：背景图亮度任意。用一张同时含近白与近黑区域的渐变当最坏情况测下来，
 *   浅色主题（白玻璃压近黑照片）需要 0.86，深色主题（深玻璃压近白照片）需要 0.84;
 *   模糊只是把邻域取平均，结果必落在这些极值的凸包内，所以极值过了就都过。
 *   取 0.88 —— 既是现有默认值，也给两套主题各留了一点余量。
 *
 * 也就是说站长的 `login_opacity` 滑杆在设了背景图之后实际可用区间是 0.88–1.00。
 * 这不是把设置项废掉：低于 0.88 的档位在有照片时必然踩 4.5:1，留着只会让站长
 * 以为「调低一点更好看」，而代价是正文读不清。
 */

/** 无背景图时的下限（GlassCard 全站通用） */
export const GLASS_ALPHA_MIN = 0.55

/** 有站长背景图时的下限（只有登录卡会遇到） */
export const GLASS_ALPHA_MIN_PHOTO = 0.88

/**
 * 登录卡实际该用的不透明度。
 *
 * @param {number|string|null|undefined} raw 站长设的 `login_opacity`
 * @param {boolean} hasPhoto 是否设了背景图
 * @returns {number|null} `null` = 没设过且不需要抬下限，交给 `--um-glass-alpha` 缺省
 */
export function authCardAlpha(raw, hasPhoto = false) {
    const floor = hasPhoto ? GLASS_ALPHA_MIN_PHOTO : GLASS_ALPHA_MIN
    const n = Number(raw)

    // 站长没设过：无背景图就用 token 缺省（0.72）；有背景图必须抬到下限，
    // 因为缺省值本身在近黑照片上就压不住正文
    if (raw === null || raw === undefined || raw === '' || Number.isNaN(n)) {
        return hasPhoto ? floor : null
    }

    return Math.min(1, Math.max(floor, n))
}
