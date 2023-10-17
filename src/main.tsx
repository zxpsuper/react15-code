import React from './react';
import ReactDOM from './react-dom';


function sayHello() {
  alert('hello')
}

const btn = React.createElement('div', { id: 'btn', style: { color: '#000', backgroundColor: 'red' }, onClick: sayHello, className: 'supername' }, '点击按钮', React.createElement('b', {}, 'hello'))

class Counter extends React.Component {
  constructor(props) {
    super(props)
    this.state = { number: 0 }
  }
  handleClick() {
    this.setState({
      number: this.state.number + 1
    })
  }
  componentDidMount() {
    setTimeout(() => {
      this.setState({
        number: this.state.number + 1
      })
    }, 1000)
  }
  componentWillMount() {
    console.log('将要挂载')
  }
  componentDidUpdate() {
    console.log('组件更新')
  }
  render() {
    // const color = this.state.number % 2 ? 'red' : 'green'
    // let p = React.createElement('p', { onClick: this.handleClick.bind(this), style: { color } }, this.props.name, this.state.number)
    // let button = React.createElement('button', { onClick: this.handleClick.bind(this) }, '点击添加')
    // return React.createElement('div', {}, p, button)
    if (this.state.number === 0) {
      return React.createElement('ul', {},
        React.createElement('li', { key: 'A' }, 'A'),
        React.createElement('li', { key: 'B' }, 'B'),
        React.createElement('li', { key: 'C' }, 'C'),
        React.createElement('li', { key: 'D' }, 'D'),
      )
    } else {
      return React.createElement('ul', {},
        React.createElement('li', { key: 'A' }, 'A'),
        React.createElement('li', { key: 'C' }, 'C'),
        React.createElement('span', { key: 'B' }, 'B'),
        React.createElement('li', { key: 'E' }, 'E'),
        React.createElement('li', { key: 'F' }, 'F'),
      )
    }

  }
}



ReactDOM.render(React.createElement(Counter, { name: '点击我吧！' }), document.getElementById('root')!)

