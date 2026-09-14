import { Icon } from './components/Icon'
import { Root } from './components/Root'
import { Title } from './components/Title'
import { ButtonProps, IconButtonProps } from './types'

// Legacy Button Component (for backward compatibility)
function Button({ title, variant = 'primary', icon, ...props }: ButtonProps) {
  return (
    <Root variant={variant} {...props}>
      {icon ? <Icon name={icon} /> : null}
      <Title>{title}</Title>
    </Root>
  )
}

// Legacy IconButton Component (for backward compatibility)

function IconButton({ icon, variant = 'primary', ...props }: IconButtonProps) {
  return (
    <Root variant={variant} {...props}>
      <Icon name={icon} />
    </Root>
  )
}

// Create compound component
const ButtonCompound = Object.assign(Button, {
  Root,
  Icon,
  Title,
})

// Export compound component and legacy components
export { ButtonCompound as Button, IconButton }
