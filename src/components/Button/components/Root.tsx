import React from 'react'
import { Pressable } from 'react-native'
import { ButtonContext } from '../hooks/ButtonContext'
import { styles } from '../styles'
import { ButtonRootProps } from '../types'

function Root({ children, variant = 'primary', ...props }: ButtonRootProps) {
  // Check if the button only contains an icon
  const childrenArray = React.Children.toArray(children)
  const isIconOnly =
    childrenArray.length === 1 &&
    React.isValidElement(childrenArray[0]) &&
    typeof childrenArray[0].type === 'function' &&
    childrenArray[0].type.name === 'Icon'

  const containerStyle = {
    ...styles.container,
    ...styles[variant],
    ...(isIconOnly && styles.iconOnly),
  }

  const pressedOpacity = variant === 'primary' ? 0.7 : 0.2

  return (
    <ButtonContext.Provider value={{ variant }}>
      <Pressable
        style={({ pressed }) => [
          containerStyle,
          pressed && { opacity: pressedOpacity },
        ]}
        {...props}
      >
        {children}
      </Pressable>
    </ButtonContext.Provider>
  )
}

export { Root }
