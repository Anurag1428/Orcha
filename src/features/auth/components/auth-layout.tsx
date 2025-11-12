import Image from "next/image"
import Link from "next/link"

export const AuthLayout = ({ children } : { children: React.ReactNode}) => {
    return (
           <div className="bg-muted items-center flex min-h-svh flex-col justify-center gap-6 p-6 md:p-10">
      <div className="flex flex-col w-full max-w-sm gap-6">
        <Link href="/" className="flex items-center gap-2 self-center font-medium">
          <Image src="/logos/logo.svg" alt="Orcha" width={50} height={50}/>
          Orcha
        </Link>
        {children}
        </div>
        </div>
    )
}