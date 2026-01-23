/**
 * File: ui/index.js
 * Description: Main entry point for the Vue application, initializing Vue, Element Plus, router and i18n
 *
 * Author: Ellinav, iBenzene, bbbugg
 */

import { createApp } from 'vue';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import App from './/App.vue';
import router from './router';
import I18n from './utils/i18n';
import './/styles/global.less';

const app = createApp(App);
app.use(router);
app.use(ElementPlus);

I18n.init().finally(() => {
    app.mount('#app');
});
