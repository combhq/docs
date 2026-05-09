import type { EnhanceAppContext } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import { theme as openapiTheme } from 'vitepress-openapi/client'
import 'vitepress-openapi/dist/style.css'

export default {
  extends: DefaultTheme,
  async enhanceApp(ctx: EnhanceAppContext) {
    await openapiTheme.enhanceApp(ctx)
  },
}
