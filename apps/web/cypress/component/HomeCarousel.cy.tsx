import React from 'react'
import Carousel from '../../app/HomeCarousel'

describe('<Carousel />', () => {
  it('renders', () => {
    cy.mount(<Carousel />)
  })
})