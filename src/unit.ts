import { ReactElement } from "./element"
import { isFunction, kebabCase } from "lodash-es"
import $ from 'jquery'
import Component from "./component"


enum types {
  MOVE = "MOVE",
  INSERT = "INSERT",
  DELETE = "DELETE"
}

type DiffQueueItem = {
  parentId: string
  parentNode: JQuery<HTMLElement>
  type: types
  fromIndex?: number
  toIndex?: number
  markUp?: string
}

/**差异队列 */
let diffQueue: DiffQueueItem[] = []
/**更新级别 */
let updateDepth = 0

/**
 * 判断新老元素是否需要深度比较，比较两者的type是否一致
 * @param oldElement 
 * @param newElement 
 * @returns 
 */
function shouldDeepCompare(oldElement, newElement) {
  if (oldElement === null || newElement === null) return false
  const oldType = typeof oldElement
  const newType = typeof newElement
  if ((oldType === 'string' || oldType === 'number') && (newType === 'string' || newType === 'number')) return true
  if (oldElement instanceof ReactElement && oldElement instanceof ReactElement) {
    return oldElement.type === newElement.type
  }
  return false
}

/**
 * 基本单元
 */
export class Unit {
  public currentElement: ReactElement
  public reactid: string
  public mountedIndex: number
  constructor(element) {
    this.currentElement = element
  }
  /**
   * 获取 html 字符串
   * @param _reactid 元素id 
   */
  getMarkUp(_reactid: string): string {
    throw new Error('getMarkUp 需覆盖后使用')
  }
  update(_newElement, _partialState?) {
    throw new Error('update 需覆盖后使用')
  }
}

/**
 * 文本单元
 */
class TextUnit extends Unit {
  getMarkUp(_reactid: string): string {
    this.reactid = _reactid
    return `<span reactid=${_reactid}>${this.currentElement}</span>`
  }
  update(_newElement): void {
    if (this.currentElement !== _newElement) {
      this.currentElement = _newElement
      $(`[reactid="${this.reactid}"]`).text(_newElement)
    }
  }
}

/**
 * 混合单元
 */
export class CompositeUnit extends Unit {
  // react组件实例
  componentInstance: Component
  // react组件render后生成的单元
  renderUnit: Unit
  getMarkUp(_reactid: string): string {
    this.reactid = _reactid
    // 解构参数
    const { type: Component, props } = this.currentElement
    // 在单元实例中保存组件实例
    const componentInstance = this.componentInstance = new Component(props) as Component
    // 在组件实例中保存单元实例
    componentInstance.currentUint = this
    // 触发生命周期 willMount
    if (componentInstance.componentWillMount && isFunction(componentInstance.componentWillMount)) {
      componentInstance.componentWillMount()
    }
    // 渲染函数产生的元素
    const renderElement = componentInstance.render()
    // 渲染函数产生的元素的单元
    const renderUint = this.renderUnit = createUnit(renderElement)
    // 渲染函数产生的元素的单元的HTML字符串
    const renderMarkUp = renderUint.getMarkUp(_reactid)
    // 订阅 didmount 事件
    $(document).on('mounted', function () {
      if (componentInstance.componentDidMount && isFunction(componentInstance.componentDidMount)) {
        componentInstance.componentDidMount()
      }
    })
    return renderMarkUp
  }

  /**负责处理组件的更新 */
  update(_newElement: any, _partialState: any): void {
    // 新元素可有可无，无则说明 shouldDeepCompare 生效
    // 此时无需创建新元素，在老元素上修改即可
    this.currentElement = _newElement || this.currentElement
    // 修改状态
    const newState = this.componentInstance.state = Object.assign(this.componentInstance.state, _partialState)
    const newProps = this.currentElement.props
    // componentShouldUpdate 执行后返回false不更新组件
    if (this.componentInstance.componentShouldUpdate && isFunction(this.componentInstance.componentShouldUpdate) && !this.componentInstance.componentShouldUpdate(newProps, newState)) {
      return
    }
    // 老的渲染单元
    const oldRenderUnit = this.renderUnit
    // 老的渲染元素
    const oldRenderElement = oldRenderUnit.currentElement
    // 新的渲染元素
    const newRenderElement = this.componentInstance.render()
    // 判断是否需要深度比较，需要深度比较便是 diff 算法
    if (shouldDeepCompare(oldRenderElement, newRenderElement)) {
      // 这个混合单元深比较，交给原生单元或者文本单元去实现，
      // 因此他俩（原生单元NativeUnit和文本单元TextUnit）也需要实现update方法
      oldRenderUnit.update(newRenderElement)
      // 执行更新生命周期函数
      if (this.componentInstance.componentDidUpdate && isFunction(this.componentInstance.componentDidUpdate)) {
        this.componentInstance.componentDidUpdate()
      }
    } else {
      // 不需要深度比较直接创建新元素替换旧元素
      const newUnit = createUnit(newRenderElement)
      const newMarkUp = newUnit.getMarkUp(this.reactid)
      $(`[reactid="${this.reactid}"]`).replaceWith(newMarkUp)
    }
  }
}

/**
 * 原生单元
 */
class NativeUnit extends Unit {
  renderChildrenUnits = []
  getMarkUp(_reactid: string): string {
    this.reactid = _reactid
    const { type, props } = this.currentElement
    let tagStart = `<${type} reactid="${_reactid}"`
    const tagEnd = `</${type}>`
    let childrenString = ''
    for (const propName in props) {
      /**解析事件 */
      if (/^on[A-Z]/.test(propName)) {
        const eventName = propName.slice(2).toLowerCase()
        $(document).on(eventName, `[reactid="${_reactid}"]`, null, function () {
          const func = props[propName]
          if (isFunction(func)) {
            func()
          }
        })
      } else if (propName === 'style') {
        // 处理样式
        const styleValue = Object.keys(props.style).map(i => kebabCase(i) + ':' + props.style[i]).join(';')
        tagStart += ` style=${styleValue}`
      } else if (propName === 'className') {
        // 处理类名
        tagStart += ` class=${props.className}`
      } else if (propName === 'children') {
        // 递归处理子元素
        const children = props.children
        childrenString = children.map((child, index) => {
          const childUnit = createUnit(child)
          // unit 中记载 child 在父元素中的索引位置，偏于 diff 时使用
          childUnit.mountedIndex = index
          this.renderChildrenUnits.push(childUnit)
          const childMarkUp = childUnit.getMarkUp(`${_reactid}.${index}`)
          return childMarkUp
        }).join('')
      } else {
        tagStart += ` ${propName}="${props[propName]}"`
      }
    }
    return tagStart + '>' + childrenString + tagEnd
  }

  /**
   * 更新 dom props
   * @param oldProps 
   * @param newProps 
   */
  updateDOMProps(oldProps, newProps) {
    for (const propName in oldProps) {
      if (!newProps.hasOwnProperty(propName)) {
        $(`reactid="${this.reactid}"`).removeAttr(propName)
      }
      // 更新前先解绑旧事件
      if (/on[A-Z]/.test(propName)) {
        const eventName = propName.slice(2).toLowerCase()
        $(document).off(eventName, `[reactid="${this.reactid}"]`)
      }
    }
    for (const propName in newProps) {
      if (propName === 'children') {
        // 有单独的方法处理children —— updateDOMChildren,这里便不做处理
        continue
      } else if (/on[A-Z]/.test(propName)) {
        // 重新绑定事件
        const eventName = propName.slice(2).toLowerCase()
        $(document).on(eventName, `[reactid="${this.reactid}"]`, null, function () {
          const func = newProps[propName]
          if (isFunction(func)) {
            func()
          }
        })
      } else if (propName === 'style') {
        // 修改样式
        Object.entries(newProps.style).forEach(([attr, value]) => {
          $(`[reactid="${this.reactid}"]`).css(attr, value as any)
        })
      } else if (propName === 'className') {
        // 修改类名
        $(`[reactid="${this.reactid}"]`).attr('class', newProps.className)
      } else {
        $(`[reactid="${this.reactid}"]`).prop(propName, newProps[propName])
      }
    }
  }

  /**
   * 更新元素
   * @param newElement 
   */
  update(newElement) {
    const oldProps = this.currentElement.props
    const newProps = newElement.props
    this.updateDOMProps(oldProps, newProps)
    this.updateDOMChildren(newProps.children)
  }
  updateDOMChildren(newChildren) {
    // updateDepth 用于记录当前 diff 树层级
    updateDepth++
    this.diff(diffQueue, newChildren)
    updateDepth--
    if (updateDepth === 0) {
      // updateDepth = 0 说明递归diff完成，执行dom patch 操作
      this.patch(diffQueue)
      diffQueue = []
    }
  }

  patch(diffQueue: DiffQueueItem[]) {
    const deleteChildren = []
    const deleteMap = {}
    for (let index = 0; index < diffQueue.length; index++) {
      const element = diffQueue[index];
      if (element.type === types.MOVE || element.type === types.DELETE) {
        // 移动和删除都要先删除，只不过保留移动的元素再map中，后续再插入
        const fromIndex = element.fromIndex
        if (fromIndex !== undefined) {
          const oldChild = $(element.parentNode.children().get(fromIndex))
          if (element.type === types.MOVE) {
            // 移动的元素再map中，后续再插入
            deleteMap[fromIndex] = oldChild
          }
          deleteChildren.push(oldChild)
        }
      }
    }
    $.each(deleteChildren, (_, item) => {
      $(item).remove()
    })
    for (let index = 0; index < diffQueue.length; index++) {
      const element = diffQueue[index];
      if (element.type === types.INSERT) {
        this.insertChildAt(element.parentNode, element.toIndex, $(element.markUp))
      } else if (element.type === types.MOVE) {
        this.insertChildAt(element.parentNode, element.toIndex, deleteMap[element.fromIndex])
      }
    }

  }

  insertChildAt(parentNode, toIndex, newNode) {
    // 先判断目标位置有没有元素
    const oldChild = parentNode.children().get(toIndex)
    if (oldChild) {
      // 目标位置有元素，则插在该元素之前
      newNode.insertBefore(oldChild)
    } else {
      // 目标位置没 有元素，则在父节点中插入元素
      newNode.appendTo(parentNode)
    }
  }

  /**
   * diff 其实就是在对象层面判断新老元素，记录需要执行的操作并将其放入 patch 队列中
   * @param diffQueue 
   * @param newChildrenElements 
   */
  diff(diffQueue: DiffQueueItem[], newChildrenElements) {
    // 老的unitMap
    const oldChildrenUnitMap = this.getElementChildrenMap(this.renderChildrenUnits)
    // 新的unit数组
    const { newChildrenUnits, newChildrenUnitsMap } = this.getNewChildrenUnits(oldChildrenUnitMap, newChildrenElements)
    // 上一个已经确定位置的索引
    let lastIndex = 0
    newChildrenUnits.forEach((newChildUnit, index) => {
      const newKey = newChildUnit?.currentElement?.props?.key || index
      const oldChildUnit = oldChildrenUnitMap[newKey]
      if (oldChildUnit === newChildUnit) {
        // 新旧单元一致说明复用了旧单元
        if (oldChildUnit.mountedIndex < lastIndex) {
          diffQueue.push({
            parentId: this.reactid,
            parentNode: $(`[reactid="${this.reactid}"]`),
            type: types.MOVE,
            fromIndex: oldChildUnit.mountedIndex,
            toIndex: index
          })
        }
        lastIndex = Math.max(lastIndex, oldChildUnit.mountedIndex)
      } else {
        if (oldChildUnit) {
          // 如果新旧unit不一致且老unit存在，说明此时存在同key但不同节点
          // 此时老节点应该删除掉
          diffQueue.push({
            parentId: this.reactid,
            parentNode: $(`[reactid="${this.reactid}"]`),
            type: types.DELETE,
            fromIndex: oldChildUnit.mountedIndex,
          })
          // 删除节点，也要删除对应的 unit
          this.renderChildrenUnits = this.renderChildrenUnits.filter(i => i !== oldChildUnit)
          // TODO:这里的用法可能有点问题
          $(document).off(null, `${oldChildUnit.reactid}`)
        }
        // 没有复用说明是一个新增节点
        diffQueue.push({
          parentId: this.reactid,
          parentNode: $(`[reactid="${this.reactid}"]`),
          type: types.INSERT,
          toIndex: index,
          markUp: newChildUnit.getMarkUp(`${this.reactid}.${index}`)
        })
      }
      // 复用的情况下需要修改新单元的索引
      newChildUnit.mountedIndex = index
    })
    for (const oldKey in oldChildrenUnitMap) {
      const oldChildUnit = oldChildrenUnitMap[oldKey]
      if (!newChildrenUnitsMap.hasOwnProperty(oldKey)) {
        diffQueue.push({
          parentId: this.reactid,
          parentNode: $(`[reactid="${this.reactid}"]`),
          type: types.DELETE,
          fromIndex: oldChildUnit.mountedIndex,
        })
        // 删除节点，也要删除对应的 unit
        this.renderChildrenUnits = this.renderChildrenUnits.filter(i => i !== oldChildUnit)
        $(document).off(null, `${oldChildUnit.reactid}`)
      }
    }
  }

  /**
   * 获取新子元素unit字典，传入老子元素字典是为了根据 key 判断能否复用
   * @param oldChildrenUnitMap 
   * @param newChildrenElements 
   * @returns 
   */
  getNewChildrenUnits(oldChildrenUnitMap: Record<any, Unit>, newChildrenElements: ReactElement[]) {
    const newChildrenUnits = []
    const newChildrenUnitsMap: Record<any, Unit> = {}
    newChildrenElements.forEach((newElement, index) => {
      const newKey = newElement.props?.key || index
      const oldUnit = oldChildrenUnitMap[newKey]
      const oldElement = oldUnit?.currentElement
      if (shouldDeepCompare(oldElement, newElement)) {
        // 执行unit 的 update 方法更新子节点
        oldUnit.update(newElement)
        newChildrenUnits.push(oldUnit)
        newChildrenUnitsMap[newKey] = oldUnit
      } else {
        const newUnit = createUnit(newElement)
        newChildrenUnits.push(newUnit)
        newChildrenUnitsMap[newKey] = newUnit
        this.renderChildrenUnits[index] = newUnit
      }
    })
    return { newChildrenUnits, newChildrenUnitsMap }
  }

  /**
   * 获取子元素unit字典，以key 或者 index 作为键
   * @param renderChildrenUnits 
   * @returns 
   */
  getElementChildrenMap(renderChildrenUnits: Unit[] = []): Record<any, Unit> {
    const map = {}
    renderChildrenUnits.forEach((item, index) => {
      const key = item?.currentElement?.props?.key || index
      map[key] = item
    })
    return map
  }
}


/**
 * 利用工厂函数创建 unit
 * @param element 
 * @returns 
 */
export function createUnit(element) {
  if (typeof element === 'string' || typeof element === 'number') {
    return new TextUnit(element)
  }
  // 普通react组件
  if (element instanceof ReactElement && typeof element.type === 'string') {
    return new NativeUnit(element)
  }
  // react类组件
  if (element instanceof ReactElement && typeof element.type === 'function') {
    return new CompositeUnit(element)
  }
}

