import { useEffect, useRef } from 'react'
import { AppProvider, useApp } from './state/store'
import { AssistantFab, MobileTabBar, PAGE_TITLE, Sidebar, SkipLink, ToastHost, TopBar } from './components/Layout'
import { AssistantOverlay, AssistantPanel } from './components/AssistantPanel'
import { Drawer } from './components/Drawer'
import { FocusOverlay } from './components/FocusOverlay'
import { NowPage } from './pages/NowPage'
import { PlanPage } from './pages/PlanPage'
import { InboxPage } from './pages/InboxPage'
import { ProgressPage } from './pages/ProgressPage'

function Shell() {
  const { page, assistantOpen, wide, drawer, focusMode } = useApp()
  // 浮层打开时，背后的页面对键盘和读屏软件“不可用”，焦点不会跑到遮罩后面
  const overlayOpen = !!drawer || focusMode || (assistantOpen && !wide)

  useEffect(() => {
    document.title = `${PAGE_TITLE[page]} · NextStep 下一步`
  }, [page])

  // 切换页面后，把焦点放到主要内容开头（读屏软件会从新页面开始读）；首次打开不动焦点
  const prevPage = useRef(page)
  useEffect(() => {
    if (prevPage.current === page) return
    prevPage.current = page
    document.getElementById('main')?.focus({ preventScroll: true })
  }, [page])

  return (
    <>
      <div id="app-shell" className="min-h-screen" inert={overlayOpen}>
        <SkipLink />
        <Sidebar />
        <div className="flex min-h-screen lg:pl-[232px]">
          <div className="flex min-w-0 flex-1 flex-col">
            <TopBar />
            <main
              id="main"
              tabIndex={-1}
              key={page}
              aria-label={PAGE_TITLE[page]}
              className="flex-1 animate-fade-in px-4 pb-36 pt-6 outline-none sm:px-6 lg:px-10 lg:pb-16 lg:pt-8"
            >
              {page === 'now' && <NowPage />}
              {page === 'plan' && <PlanPage />}
              {page === 'inbox' && <InboxPage />}
              {page === 'progress' && <ProgressPage />}
            </main>
          </div>
          {wide && assistantOpen && <AssistantPanel variant="column" />}
        </div>
        <MobileTabBar />
        <AssistantFab />
      </div>
      {!wide && <AssistantOverlay />}
      <Drawer />
      <FocusOverlay />
      <ToastHost />
    </>
  )
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  )
}
