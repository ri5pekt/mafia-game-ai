import { createApp } from 'vue';

import PrimeVue from 'primevue/config';
import Aura from '@primevue/themes/aura';

import Button from 'primevue/button';
import Card from 'primevue/card';
import Dialog from 'primevue/dialog';
import Divider from 'primevue/divider';
import InputText from 'primevue/inputtext';
import ScrollPanel from 'primevue/scrollpanel';

import App from './App.vue';
import './style.css';
import 'primeicons/primeicons.css';

const app = createApp(App);

app.use(PrimeVue, {
  theme: {
    preset: Aura
  }
});

// Globally registered components (minimal set required by spec)
app.component('Button', Button);
app.component('Dialog', Dialog);
app.component('ScrollPanel', ScrollPanel);
app.component('Card', Card);
app.component('InputText', InputText);
app.component('Divider', Divider);

app.mount('#app');


