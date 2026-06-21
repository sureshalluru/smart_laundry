/**
 * Cart state management using useReducer pattern.
 *
 * Supports both per-pound (inputWeight=true) and per-piece (inputWeight=false)
 * items in a single unified cart.
 *
 * Actions:
 *   ADD_ITEM        – Add a new item or increment quantity if already in cart
 *   UPDATE_QUANTITY – Set quantity for an item; removes item if quantity <= 0
 *   REMOVE_ITEM     – Remove an item by serviceId
 *   CLEAR_CART      – Empty the cart
 */

export const initialCartState = { items: [] };

function cartReducer(state, action) {
  switch (action.type) {
    case 'ADD_ITEM': {
      const existing = state.items.find(i => i.serviceId === action.payload.serviceId);
      if (existing) {
        return {
          items: state.items.map(i =>
            i.serviceId === action.payload.serviceId
              ? { ...i, quantity: i.quantity + action.payload.quantity }
              : i
          )
        };
      }
      return { items: [...state.items, action.payload] };
    }
    case 'UPDATE_QUANTITY': {
      if (action.quantity <= 0) {
        return { items: state.items.filter(i => i.serviceId !== action.serviceId) };
      }
      return {
        items: state.items.map(i =>
          i.serviceId === action.serviceId ? { ...i, quantity: action.quantity } : i
        )
      };
    }
    case 'REMOVE_ITEM':
      return { items: state.items.filter(i => i.serviceId !== action.serviceId) };
    case 'CLEAR_CART':
      return { items: [] };
    default:
      return state;
  }
}

export default cartReducer;
