import { FormEvent } from 'react'

export function logFormData(event: FormEvent<HTMLFormElement>): void {
    const formData = new FormData(event.currentTarget);
    for (const [key, value] of formData.entries()) {
        console.log(key + ":" + value);
    }
}
