// src/hooks/useSocket.ts
import { useEffect, useRef } from 'react'
import { socketService } from '../services/socket'
import { useAuthStore } from '../store/auth'
import { useToast } from './use-toast'

export const useSocket = () => {
  const { user } = useAuthStore()
  const { toast } = useToast()
  const toastRef = useRef(toast)
  const isInitializedRef = useRef(false)

  useEffect(() => {
    toastRef.current = toast
    socketService.setToastCallback(toast)
  }, [toast])

  useEffect(() => {
    if (user?.token && !isInitializedRef.current) {
      socketService.setToastCallback(toastRef.current)
      socketService.connect()
      isInitializedRef.current = true
    } else if (!user?.token && isInitializedRef.current) {
      socketService.disconnect()
      isInitializedRef.current = false
    }
  }, [user?.token])

  useEffect(() => {
    return () => {
      if (isInitializedRef.current) {
        socketService.disconnect()
        isInitializedRef.current = false
      }
    }
  }, [])

  return {
    forceDeviceCheck: socketService.forceDeviceCheck.bind(socketService),
    joinRoom: socketService.joinRoom.bind(socketService),
    leaveRoom: socketService.leaveRoom.bind(socketService),
    isConnected: socketService.isConnected.bind(socketService),
  }
}
