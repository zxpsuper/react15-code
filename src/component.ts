import { Unit } from "./unit"

export default class Component {
  public props: any
  public currentUint: Unit
  public state: any
  constructor(props) {
    this.props = props
  }
  setState(partialState) {
    this.currentUint.update(null, partialState)
  }
  componentWillMount() {}
  componentDidMount() {}
  componentDidUpdate() {}
  componentShouldUpdate(_nextProps, _nextState) {
    return true
  }
  render() {}
}