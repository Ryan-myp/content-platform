import React from 'react'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'

/**
 * 页面级错误边界（本地免费版）
 *
 * 关键修复：错误态必须随路由切换自动重置——
 * 否则某页渲染抛错后，边界一直停在错误页，用户点其他菜单"没反应"，只能强刷。
 * 通过 key={location.pathname} 让边界随路由重建（切页即恢复）。
 */
class ErrorBoundaryClass extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info?.componentStack)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center mb-4">
            <AlertTriangle className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">页面出现异常</h2>
          <p className="text-sm text-gray-500 max-w-md mb-6">
            该页面加载出错，但其他功能不受影响。您可以重试、返回上一页或直接回首页继续使用。
          </p>
          {this.state.error?.message && (
            <pre className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-4 py-2 mb-4 max-w-md overflow-auto">
              {this.state.error.message}
            </pre>
          )}
          <div className="flex items-center gap-3">
            <button
              onClick={this.handleReset}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              重试
            </button>
            <button
              onClick={() => window.history.back()}
              className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
            >
              返回上一页
            </button>
            <button
              onClick={() => this.props.navigate?.('/home')}
              className="flex items-center gap-2 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
            >
              <Home className="w-4 h-4" />
              回首页
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

/**
 * 路由感知包装：路径变化 → 用 key 重建边界（错误态自动清除，导航不再卡死）
 */
export default function ErrorBoundary(props) {
  const location = useLocation()
  const navigate = useNavigate()
  return <ErrorBoundaryClass key={location.pathname} {...props} navigate={navigate} />
}
