import { createApp } from 'vue'
// Archivo, the brand's typeface, bundled with the app rather than fetched from a font CDN — see
// the note at the top of styles.css. The variable weight axis covers body 400 and headings 800.
import '@fontsource-variable/archivo/wght.css'
import App from './App.vue'
import './styles.css'

createApp(App).mount('#app')
