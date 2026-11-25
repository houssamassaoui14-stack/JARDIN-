import {useSyncExternalStore} from 'react'
import {engine} from './engine'
export function useSystem(){ return useSyncExternalStore(engine.subscribe,engine.getSnapshot) }