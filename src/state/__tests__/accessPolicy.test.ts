/// <reference types="jest" />
/**
 * Task 298 (BLI 258), Guideline 5.1.1(v) — Apple từ chối app 01/09 vì màn đăng nhập chặn
 * NGAY LẦN ĐẦU mở app, kèm ảnh chụp: màn hình đầu tiên người kiểm duyệt thấy là đăng nhập,
 * không có đường đi tiếp. `resolveRootView()`/`isSignedIn()` (`../accessPolicy.ts`) là NƠI
 * DUY NHẤT App.tsx/HomeScreen.tsx/ArticleScreen.tsx hỏi "màn nào, được làm gì" — phép thử
 * này đo thẳng qua các hàm đó VÀ qua `accountStore` THẬT (mock `expo-secure-store`, không tự
 * build literal `{status:...}` tay cho hai trạng thái dễ lẫn), đúng bẫy
 * kb/lessons/2026-08-29-phep-thu-truot-duoc-nhung-do-nham-doi-tuong.md.
 *
 * THỨ TỰ `it()` DƯỚI ĐÂY CÓ Ý NGHĨA, không phải tự do sắp xếp lại: `accountStore` là module
 * đơn lẻ (singleton) sống suốt file này, không `jest.resetModules()` giữa các test — cùng
 * quy ước với `savedArticles.per-account.test.ts`. "CHƯA TỪNG đăng nhập" chỉ còn đúng nghĩa
 * ở lượt ĐẦU TIÊN chạm `accountStore` trong tiến trình Jest này, nên bài test đó PHẢI đứng
 * trước mọi `accountStore.signIn()` trong file. "VỪA đăng xuất" (HV6) cố ý đặt SAU một lượt
 * đăng nhập thật — đây chính là hai trạng thái brief Task 298 yêu cầu KHÔNG được suy luận
 * cái này từ cái kia.
 */

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    getItemAsync: jest.fn(async (key: string) => (store.has(key) ? store.get(key)! : null)),
    deleteItemAsync: jest.fn(async (key: string) => {
      store.delete(key);
    }),
  };
});

import { accountStore } from '../accountStore';
import { resolveRootView, isSignedIn } from '../accessPolicy';

describe('accessPolicy (Task 298, Guideline 5.1.1(v)) — sáu hành vi giao hàng', () => {
  it('HV1+HV3+HV4 — CHƯA TỪNG đăng nhập (SecureStore rỗng, lượt hydrate() đầu tiên trong file): resolveRootView="home" (không có màn chắn), isSignedIn=false (chưa được lưu bài, mục Tài khoản hiện nút đăng nhập)', async () => {
    await accountStore.hydrate();
    const state = accountStore.getState();
    expect(state).toEqual({ status: 'signed-out' });

    // HV1: mở app lần đầu, chưa từng đăng nhập → phải là 'home' (danh sách tin), không phải
    // màn chắn — đây đúng là màn hình người kiểm duyệt Apple chụp lại.
    expect(resolveRootView(state)).toBe('home');
    // HV3+HV4: chưa đăng nhập thì không được lưu bài (ArticleScreen phải mời đăng nhập tại
    // chỗ) và mục Tài khoản phải hiện hai nút đăng nhập, không phải bảng đăng xuất/xoá.
    expect(isSignedIn(state)).toBe(false);
  });

  it('status "unknown" (lúc accountStore đang tự hydrate) → "loading", không phải "home" — trạng thái thứ ba, không lẫn với hai trạng thái signed-out ở trên/dưới', () => {
    expect(resolveRootView({ status: 'unknown' })).toBe('loading');
  });

  it('HV5 — đã đăng nhập: resolveRootView="home", isSignedIn=true (được lưu bài, mục Tài khoản hiện đăng xuất/xoá tài khoản)', async () => {
    await accountStore.signIn({ provider: 'apple', displayName: 'Nguoi Dung A', providerUserId: 'access-policy-hv5-a' });
    const state = accountStore.getState();

    expect(resolveRootView(state)).toBe('home');
    expect(isSignedIn(state)).toBe(true);
  });

  it('HV6 — VỪA đăng xuất (nối tiếp từ trạng thái đã đăng nhập ở test trên, KHÁC "chưa từng đăng nhập"): resolveRootView vẫn "home", KHÔNG bị đẩy về màn chắn; isSignedIn quay lại false', async () => {
    // Đang signed-in (Apple, access-policy-hv5-a) từ test trước — đăng xuất rồi đo NGAY.
    await accountStore.signOut();
    const state = accountStore.getState();
    expect(state).toEqual({ status: 'signed-out' });

    // Đây chính là chỗ dễ sai nhất của Task 298: trước bản vá, 'signed-out' render
    // LoginScreen chặn toàn màn — đăng xuất sẽ bị đẩy về đúng màn Apple đã từ chối.
    expect(resolveRootView(state)).toBe('home');
    expect(isSignedIn(state)).toBe(false);
  });
});
