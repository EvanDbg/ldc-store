import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";

const loginSchema = z.object({
  password: z.string().min(1),
});

/**
 * 获取管理员用户名白名单
 * 从环境变量 ADMIN_USERNAMES 读取，逗号分隔
 * 例如: ADMIN_USERNAMES="admin1,admin2,kong"
 */
function getAdminUsernames(): string[] {
  const adminUsernames = process.env.ADMIN_USERNAMES;
  if (!adminUsernames) {
    return [];
  }
  return adminUsernames.split(",").map((name) => name.trim()).filter(Boolean);
}

// Linux DO OAuth2 Provider 配置
// 文档: https://connect.linux.do
const LinuxDoProvider = {
  id: "linux-do",
  name: "Linux DO",
  type: "oauth" as const,
  authorization: {
    url: process.env.LINUXDO_AUTHORIZATION_URL || "https://connect.linux.do/oauth2/authorize",
    params: { scope: "user" },
  },
  token: {
    url: process.env.LINUXDO_TOKEN_URL || "https://connect.linux.do/oauth2/token",
  },
  userinfo: {
    url: process.env.LINUXDO_USERINFO_URL || "https://connect.linux.do/api/user",
  },
  clientId: process.env.LINUXDO_CLIENT_ID,
  clientSecret: process.env.LINUXDO_CLIENT_SECRET,
  // 用户信息字段参考文档:
  // id - 用户唯一标识（不可变）
  // username - 论坛用户名
  // name - 论坛用户昵称（可变）
  // avatar_template - 用户头像模板URL（支持多种尺寸）
  // active - 账号活跃状态
  // trust_level - 信任等级（0-4）
  // silenced - 禁言状态
  // external_ids - 外部ID关联信息
  profile(profile: {
    id: number;
    username: string;
    name?: string;
    avatar_template?: string;
    active?: boolean;
    trust_level?: number;
    silenced?: boolean;
  }) {
    // 始终打印日志，帮助排查问题
    console.log("[LinuxDoProvider] profile 原始数据:", JSON.stringify(profile, null, 2));
    
    // 处理头像URL模板，替换 {size} 为实际尺寸
    const avatarUrl = profile.avatar_template
      ? profile.avatar_template.replace("{size}", "120")
      : undefined;
    
    // 重要：Linux DO 的用户 ID（数字）转为字符串
    // NextAuth v5 会覆盖 id 字段为内部 UUID，所以我们需要用自定义字段 linuxDoId 来保存真正的用户 ID
    const linuxDoId = String(profile.id);
    console.log("[LinuxDoProvider] linuxDoId:", linuxDoId);
    
    const result = {
      id: linuxDoId, // NextAuth 可能会覆盖这个，但我们仍然设置它
      name: profile.name || profile.username,
      email: `${profile.username}@linux.do`, // Linux DO 不返回邮箱，使用用户名构造
      image: avatarUrl,
      // 自定义字段（不会被 NextAuth 覆盖）
      linuxDoId, // 保存真正的 Linux DO 用户 ID
      username: profile.username,
      trustLevel: profile.trust_level,
      active: profile.active,
      silenced: profile.silenced,
    };
    
    console.log("[LinuxDoProvider] profile 返回数据:", JSON.stringify(result, null, 2));
    return result;
  },
};

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    // Linux DO OAuth2 登录（仅在配置了相关环境变量时启用）
    ...(process.env.LINUXDO_CLIENT_ID && process.env.LINUXDO_CLIENT_SECRET
      ? [LinuxDoProvider]
      : []),
    // 管理员密码登录
    Credentials({
      name: "credentials",
      credentials: {
        password: { label: "密码", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) {
          return null;
        }

        const { password } = parsed.data;
        const adminPassword = process.env.ADMIN_PASSWORD;

        if (!adminPassword) {
          console.error("ADMIN_PASSWORD 环境变量未设置");
          return null;
        }

        // 直接比较密码（明文）
        if (password !== adminPassword) {
          return null;
        }

        // 返回固定的管理员用户
        return {
          id: "admin",
          email: "admin@localhost",
          name: "管理员",
          role: "admin",
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, account }) {
      // 调试日志：始终打印，帮助排查生产环境问题
      console.log("[JWT Callback] 调用, user存在:", !!user, ", account provider:", account?.provider);
      
      if (user) {
        // 获取自定义字段 linuxDoId（不会被 NextAuth 覆盖）
        const linuxDoId = (user as { linuxDoId?: string }).linuxDoId;
        console.log("[JWT Callback] user.id:", user.id);
        console.log("[JWT Callback] user.linuxDoId:", linuxDoId);
        console.log("[JWT Callback] account.providerAccountId:", account?.providerAccountId);
        
        // 重要：使用 linuxDoId 作为稳定的用户 ID
        // NextAuth v5 会将 user.id 替换为内部 UUID，所以我们使用自定义字段
        const stableUserId = linuxDoId || account?.providerAccountId || user.id;
        
        // 设置 token 中的用户 ID（用于后续请求）
        token.id = stableUserId;
        token.sub = stableUserId;
        token.role = (user as { role?: string }).role;
        
        // 保存 OAuth 用户的额外信息
        if (account?.provider === "linux-do") {
          const username = (user as { username?: string }).username;
          token.username = username;
          token.trustLevel = (user as { trustLevel?: number }).trustLevel;
          token.active = (user as { active?: boolean }).active;
          token.silenced = (user as { silenced?: boolean }).silenced;
          token.provider = "linux-do";
          
          // 检查用户名是否在管理员白名单中
          const adminUsernames = getAdminUsernames();
          if (username && adminUsernames.includes(username)) {
            token.role = "admin";
            console.log("[JWT Callback] OAuth 用户在管理员白名单中:", username);
          }
        }
        
        console.log("[JWT Callback] 设置后 token:", JSON.stringify({
          id: token.id,
          sub: token.sub,
          provider: token.provider,
          username: token.username,
        }));
      } else {
        // 后续请求（token 刷新），检查 token 中是否保留了 id
        console.log("[JWT Callback] Token 刷新, token:", JSON.stringify({
          id: token.id,
          sub: token.sub,
          provider: token.provider,
          username: token.username,
        }));
      }
      return token;
    },
    async session({ session, token }) {
      // 调试日志
      console.log("[Session Callback] token.id:", token.id, ", token.sub:", token.sub, ", token.provider:", token.provider);
      
      if (session.user) {
        // 使用 token.id 或 token.sub 作为用户 ID（确保兼容性）
        session.user.id = (token.id || token.sub) as string;
        (session.user as { role?: string }).role = token.role as string;
        // 传递 OAuth 用户信息到 session
        (session.user as { username?: string }).username = token.username as string;
        (session.user as { trustLevel?: number }).trustLevel = token.trustLevel as number;
        (session.user as { active?: boolean }).active = token.active as boolean;
        (session.user as { silenced?: boolean }).silenced = token.silenced as boolean;
        (session.user as { provider?: string }).provider = token.provider as string;
        
        console.log("[Session Callback] 最终 session.user.id:", session.user.id);
      }
      return session;
    },
  },
  pages: {
    signIn: "/admin/login",
  },
  session: {
    strategy: "jwt",
  },
  // Vercel 部署必需：信任代理主机
  trustHost: true,
  // 调试模式：打印更多日志
  debug: process.env.NODE_ENV === "development",
});

