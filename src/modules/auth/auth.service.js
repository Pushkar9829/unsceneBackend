const { ROLES } = require("../../config/constants");
const otpService = require("../../common/services/otpService");
const { normalizePhoneForDb, isValidIndianMobile } = require("../../common/utils/phone");
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} = require("../../common/utils/jwt");
const { comparePassword } = require("../../common/utils/hash");
const {
  findUserByPhone,
  createUser,
  findUserById,
  incrementUserTokenVersion,
} = require("../user/user.repository");
const {
  findAdminByEmail,
  findAdminById,
  incrementAdminTokenVersion,
} = require("../admin/admin.repository");

const issueUserTokenPair = (user) => {
  const tv = Number(user.tokenVersion ?? 0);
  const id = user._id;
  return {
    token: signAccessToken({
      id,
      role: ROLES.USER,
      panel: "user",
      tv,
    }),
    refreshToken: signRefreshToken({
      id,
      role: ROLES.USER,
      panel: "user",
      tv,
    }),
  };
};

const issueAdminTokenPair = (admin) => {
  const tv = Number(admin.tokenVersion ?? 0);
  const id = admin._id;
  return {
    token: signAccessToken({
      id,
      role: ROLES.ADMIN,
      panel: "admin",
      tv,
    }),
    refreshToken: signRefreshToken({
      id,
      role: ROLES.ADMIN,
      panel: "admin",
      tv,
    }),
  };
};

const sendUserOtp = async ({ phone }) => {
  if (!phone) {
    throw new Error("phone is required");
  }
  if (!isValidIndianMobile(phone)) {
    throw new Error("Enter a valid 10-digit mobile number");
  }
  await otpService.createAndSendOtp(phone);
};

const verifyUserOtpAndAuth = async ({ phone, otp, name }) => {
  const phoneDb = normalizePhoneForDb(phone);
  console.log("[AUTH][USER] service start", { phone: phoneDb });
  if (!phone || !otp) {
    throw new Error("phone and otp are required");
  }
  if (!isValidIndianMobile(phone)) {
    throw new Error("Enter a valid 10-digit mobile number");
  }

  const otpStr = String(otp).trim();
  if (!otpStr) {
    throw new Error("Invalid or expired OTP");
  }
  if (!otpService.verifyOtp(phone, otpStr)) {
    throw new Error("Invalid or expired OTP");
  }

  let user = await findUserByPhone(phoneDb);
  let isNewUser = false;

  if (!user) {
    console.log("[AUTH][USER] creating new user", { phone: phoneDb, hasName: Boolean(name) });
    user = await createUser({ name, phone: phoneDb });
    isNewUser = true;
  } else {
    console.log("[AUTH][USER] existing user login", { userId: user._id });
  }

  const { token, refreshToken } = issueUserTokenPair(user);

  return {
    token,
    refreshToken,
    isNewUser,
    user,
  };
};

const loginAdmin = async ({ email, password }) => {
  console.log("[AUTH][ADMIN] service start", { email });
  if (!email || !password) {
    throw new Error("email and password are required");
  }

  const admin = await findAdminByEmail(email);
  if (!admin) {
    console.log("[AUTH][ADMIN] admin not found", { email });
    throw new Error("Invalid credentials");
  }

  const isValidPassword = await comparePassword(password, admin.passwordHash);
  if (!isValidPassword) {
    console.log("[AUTH][ADMIN] invalid password", { adminId: admin._id });
    throw new Error("Invalid credentials");
  }
  console.log("[AUTH][ADMIN] credentials valid", { adminId: admin._id });

  const { token, refreshToken } = issueAdminTokenPair(admin);

  return {
    token,
    refreshToken,
    admin: {
      id: admin._id,
      name: admin.name,
      email: admin.email,
      role: admin.role,
    },
  };
};

const refreshSession = async ({ refreshToken }) => {
  if (!refreshToken) {
    throw new Error("refreshToken is required");
  }

  let decoded;
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch {
    throw new Error("Invalid or expired refresh token");
  }

  const tokenTv = Number(decoded.tv);
  const { id, panel, role } = decoded;

  if (panel === "user" && role === ROLES.USER) {
    const user = await findUserById(id);
    if (!user || !user.isActive) {
      throw new Error("User not found");
    }
    if (Number(user.tokenVersion ?? 0) !== tokenTv) {
      throw new Error("Session revoked");
    }
    return {
      ...issueUserTokenPair(user),
      panel: "user",
    };
  }

  if (panel === "admin" && role === ROLES.ADMIN) {
    const admin = await findAdminById(id);
    if (!admin) {
      throw new Error("Admin not found");
    }
    if (Number(admin.tokenVersion ?? 0) !== tokenTv) {
      throw new Error("Session revoked");
    }
    return {
      ...issueAdminTokenPair(admin),
      panel: "admin",
    };
  }

  throw new Error("Invalid session");
};

const logoutWithAccessToken = async (accessPayload) => {
  const { id, panel, role } = accessPayload;
  if (panel === "user" && role === ROLES.USER) {
    await incrementUserTokenVersion(id);
    return;
  }
  if (panel === "admin" && role === ROLES.ADMIN) {
    await incrementAdminTokenVersion(id);
    return;
  }
  throw new Error("Invalid session");
};

module.exports = {
  sendUserOtp,
  verifyUserOtpAndAuth,
  loginAdmin,
  refreshSession,
  logoutWithAccessToken,
};
