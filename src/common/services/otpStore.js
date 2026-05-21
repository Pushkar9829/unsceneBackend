const OTP_TTL_MS = 5 * 60 * 1000;

/** @type {Map<string, { otp: string, expiresAt: number }>} */
const store = new Map();

const set = (normalizedMobile, otp) => {
  store.set(normalizedMobile, {
    otp: String(otp),
    expiresAt: Date.now() + OTP_TTL_MS,
  });
};

/** One-time verify — deletes entry on success. */
const consume = (normalizedMobile, otp) => {
  const key = String(normalizedMobile);
  const entry = store.get(key);
  if (!entry) {
    return false;
  }
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return false;
  }
  if (entry.otp !== String(otp).trim()) {
    return false;
  }
  store.delete(key);
  return true;
};

module.exports = {
  OTP_TTL_MS,
  set,
  consume,
};
