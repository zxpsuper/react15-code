export class ReactElement {
  constructor(public type, public props) {}
}

/**
 * 创建react虚拟dom
 * @param type 类型，可以是 div 等标签文本，也可以是类函数
 * @param props 参数
 * @param children 子项
 * @returns 
 */
export function createElement(type, props, ...children) {
  props = props || {}
  props.children = children || []
  return new ReactElement(type, props)
}