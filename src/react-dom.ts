import { createUnit } from "./unit"
import $ from 'jquery'


export default {
  rootIndex: '0',
  render(element, container: HTMLElement) {
    container.innerHTML = `<span reactid="${this.rootIndex}">${element}</span>`
    const unit = createUnit(element)
    const markUp = unit.getMarkUp(this.rootIndex)
    $(container).html(markUp)
    $(document).trigger('mounted')
  },
}