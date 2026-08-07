import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import { globalIgnores } from 'eslint/config'
import pluginVue from 'eslint-plugin-vue'

export default defineConfigWithVueTs(
  { name: 'app/files', files: ['**/*.ts', '**/*.vue'] },
  // `archive/` is a record of the retired implementation, not code we maintain.
  globalIgnores(['dist/**', 'coverage/**', 'archive/**']),
  pluginVue.configs['flat/essential'],
  vueTsConfigs.recommended,
)
