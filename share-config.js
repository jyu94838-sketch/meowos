/**
 * 资源站（共享广场）云端配置 —— 站长填写一次，所有访问这个网站的人共用。
 * 获取方式见 SHARE-SETUP.md：Supabase 控制台 → Project Settings → API
 *   url:     Project URL，形如 https://abcdefgh.supabase.co
 *   anonKey: Project API keys 里的 anon / public key（可以公开，不是 service_role！）
 * 留空则资源站只能本地导出/导入 PNG，广场不可用。
 */
window.MX_SHARE_CONFIG = {
  url: "",
  anonKey: ""
};
