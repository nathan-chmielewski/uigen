// @vitest-environment node
import { describe, test, expect, vi, beforeEach } from "vitest";
import { SignJWT, jwtVerify } from "jose";

vi.mock("server-only", () => ({}));

const mockCookieSet = vi.fn();
const mockCookieGet = vi.fn();
const mockCookieStore = { set: mockCookieSet, get: mockCookieGet };

vi.mock("next/headers", () => ({
  cookies: vi.fn(() => Promise.resolve(mockCookieStore)),
}));

const SECRET = new TextEncoder().encode("development-secret-key");

async function makeToken(payload: object) {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .sign(SECRET);
}

describe("createSession", () => {
  beforeEach(() => {
    mockCookieSet.mockClear();
    mockCookieGet.mockClear();
  });

  test("sets an httpOnly cookie named auth-token", async () => {
    const { createSession } = await import("@/lib/auth");
    await createSession("user-1", "test@example.com");

    expect(mockCookieSet).toHaveBeenCalledOnce();
    const [name, , options] = mockCookieSet.mock.calls[0];
    expect(name).toBe("auth-token");
    expect(options.httpOnly).toBe(true);
  });

  test("cookie expires in ~7 days", async () => {
    const before = Date.now();
    const { createSession } = await import("@/lib/auth");
    await createSession("user-1", "test@example.com");

    const [, , options] = mockCookieSet.mock.calls[0];
    const expiresMs = options.expires.getTime();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    expect(expiresMs - before).toBeGreaterThanOrEqual(sevenDaysMs - 1000);
    expect(expiresMs - before).toBeLessThanOrEqual(sevenDaysMs + 1000);
  });

  test("token is a valid JWT containing userId and email", async () => {
    const { createSession } = await import("@/lib/auth");
    await createSession("user-123", "hello@example.com");

    const [, token] = mockCookieSet.mock.calls[0];
    const { payload } = await jwtVerify(token, SECRET);

    expect(payload.userId).toBe("user-123");
    expect(payload.email).toBe("hello@example.com");
  });
});

describe("getSession", () => {
  beforeEach(() => {
    mockCookieGet.mockClear();
  });

  test("returns null when no auth-token cookie exists", async () => {
    mockCookieGet.mockReturnValue(undefined);
    const { getSession } = await import("@/lib/auth");

    const session = await getSession();
    expect(session).toBeNull();
  });

  test("returns decoded session payload for a valid token", async () => {
    const token = await makeToken({
      userId: "user-42",
      email: "valid@example.com",
      expiresAt: new Date(),
    });
    mockCookieGet.mockReturnValue({ value: token });
    const { getSession } = await import("@/lib/auth");

    const session = await getSession();
    expect(session?.userId).toBe("user-42");
    expect(session?.email).toBe("valid@example.com");
  });

  test("returns null for a tampered or invalid token", async () => {
    mockCookieGet.mockReturnValue({ value: "not.a.valid.jwt" });
    const { getSession } = await import("@/lib/auth");

    const session = await getSession();
    expect(session).toBeNull();
  });
});
