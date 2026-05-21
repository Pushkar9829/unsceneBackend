/**
 * Store/query key for User.phone — 10-digit Indian mobile without country code.
 * @param {string} phone
 * @returns {string}
 */
const normalizePhoneForDb = (phone) => {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) {
    return digits.slice(2);
  }
  if (digits.length === 10) {
    return digits;
  }
  return digits;
};

const isValidIndianMobile = (phone) => /^[6-9]\d{9}$/.test(normalizePhoneForDb(phone));

module.exports = {
  normalizePhoneForDb,
  isValidIndianMobile,
};
