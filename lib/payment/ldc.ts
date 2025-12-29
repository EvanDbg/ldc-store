/**
 * Linux DO Credit 支付集成
 * 基于 EasyPay 兼容协议
 */

import crypto from "crypto";

interface PaymentParams {
  pid: string;
  type: string;
  out_trade_no: string;
  name: string;
  money: string;
  notify_url?: string;
  return_url?: string;
  device?: string;
}

interface NotifyParams {
  pid: string;
  trade_no: string;
  out_trade_no: string;
  type: string;
  name: string;
  money: string;
  trade_status: string;
  sign_type: string;
  sign: string;
}

interface OrderQueryResult {
  code: number;
  msg: string;
  trade_no: string;
  out_trade_no: string;
  type: string;
  pid: string;
  addtime: string;
  endtime: string;
  name: string;
  money: string;
  status: number;
}

/**
 * 生成签名
 * 1. 取所有非空字段（排除 sign、sign_type）
 * 2. 按 ASCII 升序排列
 * 3. 拼接成 k1=v1&k2=v2 格式
 * 4. 末尾追加密钥后 MD5
 */
export function generateSign(
  params: Record<string, string | undefined>,
  secret: string
): string {
  // 过滤空值，排除 sign 和 sign_type
  const filteredParams = Object.entries(params)
    .filter(
      ([key, value]) =>
        value !== undefined &&
        value !== "" &&
        key !== "sign" &&
        key !== "sign_type"
    )
    .sort(([a], [b]) => a.localeCompare(b));

  // 拼接成 k1=v1&k2=v2 格式
  const queryString = filteredParams
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  // 追加密钥并 MD5
  const signStr = queryString + secret;
  return crypto.createHash("md5").update(signStr).digest("hex");
}

/**
 * 验证回调签名
 */
export function verifySign(params: NotifyParams, secret: string): boolean {
  const { sign, sign_type, ...rest } = params;

  // 过滤空值并排序
  const sortedParams = Object.entries(rest)
    .filter(([, value]) => value !== undefined && value !== "")
    .sort(([a], [b]) => a.localeCompare(b));

  // 拼接字符串
  const queryString = sortedParams
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  // 计算签名
  const expectedSign = crypto
    .createHash("md5")
    .update(queryString + secret)
    .digest("hex");

  return sign === expectedSign;
}

/**
 * 创建支付订单
 * 返回支付页面 URL
 * @param orderId 订单号
 * @param amount 金额
 * @param productName 商品名称
 * @param siteUrl 网站地址（用于回调），自动从请求头获取
 */
export async function createPayment(
  orderId: string,
  amount: number,
  productName: string,
  siteUrl: string
): Promise<string> {
  let gateway = process.env.LDC_GATEWAY || "https://credit.linux.do/epay";
  const pid = process.env.LDC_PID;
  const secret = process.env.LDC_SECRET;

  if (!pid || !secret) {
    throw new Error("支付配置未设置：请在 .env 文件中配置 LDC_PID 和 LDC_SECRET");
  }

  // 确保网关地址格式正确
  gateway = gateway.replace(/\/+$/, ""); // 移除末尾斜杠
  if (!gateway.includes("/epay")) {
    gateway = gateway + "/epay";
  }

  const params: PaymentParams = {
    pid,
    type: "epay",
    out_trade_no: orderId,
    name: productName.slice(0, 64), // 最多 64 字符
    money: amount.toFixed(2),
    notify_url: `${siteUrl}/api/payment/notify`,
    return_url: `${siteUrl}/order/result?orderNo=${orderId}`,
  };

  const sign = generateSign(params as unknown as Record<string, string>, secret);

  const formData = new URLSearchParams({
    ...params,
    sign,
    sign_type: "MD5",
  } as Record<string, string>);

  // 调试日志
  console.log("LDC 支付请求:", {
    gateway,
    url: `${gateway}/pay/submit.php`,
    params: { ...params, sign, sign_type: "MD5" },
  });

  // 发起请求，获取跳转 URL
  const response = await fetch(`${gateway}/pay/submit.php`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formData,
    redirect: "manual",
  });

  // 成功时返回 302 重定向
  if (response.status === 302) {
    const location = response.headers.get("Location");
    if (location) {
      return location;
    }
  }

  // 处理错误 - 先获取响应文本以便调试
  const responseText = await response.text();
  console.error("LDC 支付 API 响应:", {
    status: response.status,
    statusText: response.statusText,
    headers: Object.fromEntries(response.headers.entries()),
    body: responseText.slice(0, 500), // 只打印前 500 字符
  });

  // 尝试解析为 JSON
  try {
    const error = JSON.parse(responseText);
    throw new Error(error.error_msg || `创建支付订单失败 (HTTP ${response.status})`);
  } catch (e) {
    if (e instanceof Error && e.message.includes("创建支付订单失败")) {
      throw e;
    }
    // JSON 解析失败，可能是 HTML 错误页面
    // 检查是否是常见错误
    if (responseText.includes("签名验证失败")) {
      throw new Error("签名验证失败，请检查 LDC_SECRET 配置");
    }
    if (responseText.includes("不支持的请求类型")) {
      throw new Error("不支持的请求类型，type 必须为 epay");
    }
    throw new Error(`创建支付订单失败 (HTTP ${response.status})，请检查支付配置`);
  }
}

/**
 * 查询订单状态
 */
export async function queryPaymentOrder(
  tradeNo: string
): Promise<OrderQueryResult> {
  const gateway = process.env.LDC_GATEWAY || "https://credit.linux.do/epay";
  const pid = process.env.LDC_PID;
  const secret = process.env.LDC_SECRET;

  if (!pid || !secret) {
    throw new Error("支付配置未设置");
  }

  const params = new URLSearchParams({
    act: "order",
    pid,
    key: secret,
    trade_no: tradeNo,
  });

  const response = await fetch(`${gateway}/api.php?${params}`);
  const result = await response.json();

  if (result.code !== 1) {
    throw new Error(result.msg || "查询订单失败");
  }

  return result;
}

/**
 * 退款
 */
export async function refundOrder(
  tradeNo: string,
  money: string
): Promise<{ code: number; msg: string }> {
  const gateway = process.env.LDC_GATEWAY || "https://credit.linux.do/epay";
  const pid = process.env.LDC_PID;
  const secret = process.env.LDC_SECRET;

  if (!pid || !secret) {
    throw new Error("支付配置未设置");
  }

  const response = await fetch(`${gateway}/api.php`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pid,
      key: secret,
      trade_no: tradeNo,
      money,
    }),
  });

  return response.json();
}

export type { PaymentParams, NotifyParams, OrderQueryResult };

