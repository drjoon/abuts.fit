import bcrypt from "bcryptjs";

/**
 * 비밀번호를 해시화하는 함수
 * @param {string} password - 해시화할 비밀번호
 * @returns {Promise<string>} 해시화된 비밀번호
 */
export async function hashPassword(password) {
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(password, salt);
}

/**
 * 비밀번호를 검증하는 함수
 * @param {string} candidatePassword - 검증할 비밀번호
 * @param {string} hashedPassword - 저장된 해시 비밀번호
 * @returns {Promise<boolean>} 비밀번호 일치 여부
 */
export async function comparePassword(candidatePassword, hashedPassword) {
  return await bcrypt.compare(candidatePassword, hashedPassword);
}

export default {
  hashPassword,
  comparePassword
};
