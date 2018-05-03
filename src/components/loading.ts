import * as canvasContainer from '../core/canvas-container'
import { Loader } from 'hyperapp-feather'
import { h } from '../ui/uikit'

interface LoaderParams {
  size?: number,
  color?: string,
}

export default ({ color, size = canvasContainer.font.size + 2 } = {} as LoaderParams) => h('div', {
  style: {
    color: color || 'rgba(255, 255, 255, 0.3)',
    animation: 'spin 2.5s linear infinite',
    height: `${size}px`,
    width: `${size}px`,
  }
}, [
  ,h(Loader, { size })
])
