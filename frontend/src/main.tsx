import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

// 폰트는 전부 self-host 한다 (외부 CDN 의존 없이 오프라인에서도 같은 화면이 나오도록).
import 'pretendard/dist/web/variable/pretendardvariable.css'
import '@fontsource/gowun-batang/latin-400.css'
import '@fontsource/gowun-batang/latin-700.css'
import '@fontsource/gowun-batang/korean-400.css'
import '@fontsource/gowun-batang/korean-700.css'
import '@fontsource/nanum-pen-script/latin-400.css'
import '@fontsource/nanum-pen-script/korean-400.css'
import '@fontsource/italianno/latin-400.css'

import './styles/tokens.css'
import './styles/base.css'
import './styles/app.css'
import './styles/admin.css'

import App from './App'
import { ProfileProvider } from './lib/store'
import { ToastProvider } from './components/ui'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <ProfileProvider>
          <App />
        </ProfileProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>
)
