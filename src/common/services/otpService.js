const env = require("../../config/env");
const otpStore = require("./otpStore");
const { normalizePhoneForDb } = require("../utils/phone");

const MSG91_FLOW_URL = "https://api.msg91.com/api/v5/flow/";

const isDemoOtpEnabled = () => Boolean(env.demoOtpEnabled && env.demoPhone && env.demoOtp);

const isDemoPhone = (mobileNumber) => {
  if (!isDemoOtpEnabled()) {
    return false;
  }
  return normalizePhoneForDb(mobileNumber) === normalizePhoneForDb(env.demoPhone);
};

const isDemoOtpMatch = (otp) => {
  if (!isDemoOtpEnabled()) {
    return false;
  }
  return String(otp || "").trim() === String(env.demoOtp).trim();
};

/** True when this phone + OTP pair is the configured demo test login. */
const verifyDemoOtp = (mobileNumber, otp) => isDemoPhone(mobileNumber) && isDemoOtpMatch(otp);

/**
 * Normalize for OTP store + Msg91 (digits only, India 10-digit → 91 prefix).
 * @param {string} mobileNumber
 * @returns {string}
 */
const normalizeMobile = (mobileNumber) => {
  const digits = String(mobileNumber || "").replace(/\D/g, "");
  if (digits.length === 10) {
    return `91${digits}`;
  }
  if (digits.length === 12 && digits.startsWith("91")) {
    return digits;
  }
  return digits;
};

const generateOtp = (length = 6) => {
  const max = 10 ** length;
  const num = Math.floor(Math.random() * max);
  return String(num).padStart(length, "0");
};

const buildRecipient = (normalizedMobile, otp) => {
  const recipient = { mobiles: normalizedMobile };
  const varName = (env.msg91OtpVarName || "").trim();

  if (varName) {
    recipient[varName] = otp;
    return recipient;
  }

  recipient.var = otp;
  recipient.VAR1 = otp;
  recipient["#var#"] = otp;
  return recipient;
};

const sendOtpSms = async (mobileNumber, otp) => {
  const normalizedMobile = normalizeMobile(mobileNumber);
  const authKey = env.msg91AuthKey;

  if (!authKey) {
    console.log("[OTP] MSG91_AUTH_KEY not set — OTP for", normalizedMobile, ":", otp);
    return;
  }

  if (!env.msg91FlowId) {
    console.log("[OTP] MSG91_FLOW_ID not set — OTP for", normalizedMobile, ":", otp);
    return;
  }

  const body = {
    flow_id: env.msg91FlowId,
    recipients: [buildRecipient(normalizedMobile, otp)],
  };

  if (env.msg91SenderId) {
    body.sender = env.msg91SenderId;
  }

  const response = await fetch(MSG91_FLOW_URL, {
    method: "POST",
    headers: {
      authkey: authKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text };
  }

  if (!response.ok) {
    console.error("[OTP] Msg91 send failed", {
      status: response.status,
      body: parsed,
    });
    throw new Error("Failed to send OTP");
  }

  console.log("[OTP] Msg91 send ok", { mobile: normalizedMobile, response: parsed });
};

const createAndSendOtp = async (mobileNumber) => {
  if (isDemoPhone(mobileNumber)) {
    console.log(
      "[OTP][DEMO] Play Store / test account",
      normalizePhoneForDb(mobileNumber),
      "— use OTP",
      env.demoOtp,
      "(no SMS sent)"
    );
    return env.demoOtp;
  }

  const otp = generateOtp(6);
  const normalizedMobile = normalizeMobile(mobileNumber);
  otpStore.set(normalizedMobile, otp);
  await sendOtpSms(mobileNumber, otp);
  return otp;
};

const verifyOtp = (mobileNumber, otp) => {
  const otpStr = String(otp || "").trim();
  if (!otpStr) {
    return false;
  }
  if (verifyDemoOtp(mobileNumber, otpStr)) {
    return true;
  }
  return otpStore.consume(normalizeMobile(mobileNumber), otpStr);
};

module.exports = {
  normalizeMobile,
  generateOtp,
  createAndSendOtp,
  verifyOtp,
  isDemoPhone,
  verifyDemoOtp,
};
