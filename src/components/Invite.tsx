import { Copy } from "lucide-react"

import { Button } from "@/components/ui/button"
import { IoPersonAdd } from "react-icons/io5";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { headers } from 'next/headers'

type Props = {
    inviteCode: string | undefined
}

export function Invite({inviteCode}: Props) {

    const headersList = headers()
    
    const origin = headersList.get('Host')

  return (
    <Dialog>
      <DialogTrigger asChild>
        <IoPersonAdd />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share link</DialogTitle>
          <DialogDescription>
            Anyone who has this link will be able to join.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center space-x-2">
          <div className="grid flex-1 gap-2">
            <Label htmlFor="link" className="sr-only">
              Link
            </Label>
            <Input
              id="link"
              defaultValue={`${origin}/leagues/join?invite=${inviteCode}`}
              readOnly
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
