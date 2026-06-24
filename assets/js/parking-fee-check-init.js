import { initToolDrawer } from './tool-drawer.js?v=20260623-tool-drawer-all-calculators';
import { initParkingBudgetMap } from './parking-budget-map.js?v=20260622-parking-nonads-perf-safe';

document.addEventListener('DOMContentLoaded', () => {
  initToolDrawer();
  initParkingBudgetMap();
});
