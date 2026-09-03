import { registerRootComponent } from 'expo';

// Task 305 (BLI 299, AD-18): `TaskManager.defineTask()` bên trong module này PHẢI chạy ở
// phạm vi module — nạp VÔ ĐIỀU KIỆN trước `registerRootComponent`, vì hệ điều hành có thể
// khởi JS bundle ở chế độ nền mà KHÔNG mount `App` (xem đầu file `backgroundTask.ts`).
import './src/background/backgroundTask';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
