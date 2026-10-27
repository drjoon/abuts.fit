import { describe, expect, it, beforeEach } from "@jest/globals";
import {
  PopbillSmsGuardError,
  chunkSmsMessages,
  configurePopbillSmsGuardForTests,
  consumeActorSmsBudget,
  consumeEphemeralPhoneSms,
  consumeSignupSmsIpBudget,
  reservePopbillSmsMessages,
  resetPopbillSmsGuardForTests,
  SMS_COOLDOWN_MS,
  SMS_SEND_CHUNK_SIZE,
} from "../../utils/popbillSmsGuard.js";

function sms(phone, content) {
  return { Receiver: phone, Contents: content, ReceiverName: "", Subject: "알림" };
}

describe("popbillSmsGuard", () => {
  beforeEach(() => {
    resetPopbillSmsGuardForTests();
  });

  it("같은 번호·같은 내용은 5분 안에 다시 잡지 않는다", () => {
    const now = 1_000_000;
    const first = reservePopbillSmsMessages([sms("01011112222", "같은 내용")], now);
    first.release();
    expect(() =>
      reservePopbillSmsMessages([sms("01011112222", "같은 내용")], now + 1000),
    ).toThrow(PopbillSmsGuardError);
    const later = reservePopbillSmsMessages(
      [sms("01011112222", "같은 내용")],
      now + SMS_COOLDOWN_MS + 1,
    );
    later.release();
    expect(later.messages).toHaveLength(1);
  });

  it("보내는 도중 같은 내용이 다시 들어오면 팝빌 호출 전에 거절한다", () => {
    const now = 2_000_000;
    const first = reservePopbillSmsMessages([sms("01011112222", "진행 중")], now);
    expect(() =>
      reservePopbillSmsMessages([sms("01011112222", "진행 중")], now + 10),
    ).toThrow(PopbillSmsGuardError);
    first.release();
  });

  it("한 번호에 짧은 시간 반복이면 루프로 보고 막는다", () => {
    configurePopbillSmsGuardForTests({ phoneBurstMax: 3 });
    const now = 3_000_000;
    for (let i = 0; i < 3; i += 1) {
      const held = reservePopbillSmsMessages(
        [sms("01011112222", `다른 내용 ${i}`)],
        now + i,
      );
      held.release();
    }
    expect(() =>
      reservePopbillSmsMessages([sms("01011112222", "다른 내용 4")], now + 10),
    ).toThrow(PopbillSmsGuardError);
  });

  it("50명을 넘으면 50명씩 나눈다", () => {
    const rows = Array.from({ length: 51 }, (_, i) =>
      sms(`0101111${String(i).padStart(4, "0")}`, "안내"),
    );
    const chunks = chunkSmsMessages(rows, SMS_SEND_CHUNK_SIZE);
    expect(chunks.map((chunk) => chunk.length)).toEqual([50, 1]);
  });

  it("10초에 한도를 넘기면 막고 관리자 알림은 한 번만 켠다", () => {
    configurePopbillSmsGuardForTests({ globalMaxPerWindow: 2, phoneBurstMax: 100 });
    const now = 4_000_000;
    reservePopbillSmsMessages([sms("01011110001", "a")], now).release();
    reservePopbillSmsMessages([sms("01011110002", "b")], now + 1).release();
    let first;
    try {
      reservePopbillSmsMessages([sms("01011110003", "c")], now + 2);
    } catch (error) {
      first = error;
    }
    expect(first).toBeInstanceOf(PopbillSmsGuardError);
    expect(first.code).toBe("SMS_LOOP");
    expect(first.alertAdmin).toBe(true);
    let second;
    try {
      reservePopbillSmsMessages([sms("01011110004", "d")], now + 3);
    } catch (error) {
      second = error;
    }
    expect(second.alertAdmin).toBe(false);
  });

  it("가입 문자는 프로세스 메모리에서 번호당 하루 5건이다", () => {
    const phone = "01099998888";
    for (let i = 0; i < 5; i += 1) {
      const slot = consumeEphemeralPhoneSms({
        phone,
        todayKey: "2026-10-27",
        now: 5_000_000 + i * (SMS_COOLDOWN_MS + 1),
      });
      expect(slot.ok).toBe(true);
    }
    const blocked = consumeEphemeralPhoneSms({
      phone,
      todayKey: "2026-10-27",
      now: 5_000_000 + 6 * (SMS_COOLDOWN_MS + 1),
    });
    expect(blocked.ok).toBe(false);
    expect(blocked.code).toBe("SMS_DAILY_LIMIT");
  });

  it("가입 IP는 서로 다른 번호를 하루 한도 넘게 태우지 못한다", () => {
    configurePopbillSmsGuardForTests({ signupIpDistinctPhones: 2, signupIpDailyMax: 10 });
    expect(
      consumeSignupSmsIpBudget({ ip: "1.1.1.1", phone: "01000000001", todayKey: "2026-10-27" }).ok,
    ).toBe(true);
    expect(
      consumeSignupSmsIpBudget({ ip: "1.1.1.1", phone: "01000000002", todayKey: "2026-10-27" }).ok,
    ).toBe(true);
    const blocked = consumeSignupSmsIpBudget({
      ip: "1.1.1.1",
      phone: "01000000003",
      todayKey: "2026-10-27",
    });
    expect(blocked.ok).toBe(false);
    expect(blocked.code).toBe("SMS_IP_LIMIT");
  });

  it("긴급 문자는 한 시간에 다른 내용만 10건이고 같은 내용은 막는다", () => {
    configurePopbillSmsGuardForTests({ actorHourlyMax: 2 });
    const now = 6_000_000;
    expect(consumeActorSmsBudget({ actorId: "owner", content: "첫번째", now }).ok).toBe(true);
    const same = consumeActorSmsBudget({ actorId: "owner", content: "첫번째", now: now + 1 });
    expect(same.ok).toBe(false);
    expect(same.code).toBe("SMS_SAME_CONTENT");
    expect(consumeActorSmsBudget({ actorId: "owner", content: "두번째", now: now + 2 }).ok).toBe(true);
    const third = consumeActorSmsBudget({ actorId: "owner", content: "세번째", now: now + 3 });
    expect(third.ok).toBe(false);
    expect(third.code).toBe("SMS_ACTOR_LIMIT");
  });
});
