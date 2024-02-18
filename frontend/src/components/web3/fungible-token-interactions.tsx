'use client'

import { FC, useEffect, useState } from 'react'

import { zodResolver } from '@hookform/resolvers/zod'
import {
  contractQuery,
  decodeOutput,
  useInkathon,
  useRegisteredContract,
} from '@scio-labs/use-inkathon'
import { SubmitHandler, useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import * as z from 'zod'

import { Card, CardContent } from '@/components/ui/card'
import { Form, FormControl, FormItem, FormLabel } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { contractTxWithToast } from '@/utils/contract-tx-with-toast'

const formSchema = z.object({
  newMessage: z.string().min(1).max(90),
})

interface FungibleTokenInteractionProps {
  contractId: string
}

export const FungibleTokenInteraction: FC<FungibleTokenInteractionProps> = ({ contractId }) => {
  const { api, activeAccount, activeSigner } = useInkathon()
  const { contract, address: contractAddress } = useRegisteredContract(contractId)
  const [name, setName] = useState<string>()
  const [balanceOf, setBalanceOf] = useState<string>()

  const [fetchIsLoading, setFetchIsLoading] = useState<boolean>()

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
  })

  const { register, reset, handleSubmit } = form

  // Fetch Greeting
  const fetchToken = async () => {
    if (!contract || !api || typeof contractAddress !== 'string') return

    setFetchIsLoading(true)
    try {
      const result = await contractQuery(api, contractAddress, contract, 'erc20::balanceOf', {}, [
        activeAccount?.address || '',
      ])
      const { output, isError, decodedOutput } = decodeOutput(result, contract, 'erc20::balanceOf')
      // console.log('Fetching Balance 2', result, output, isError, decodedOutput)
      if (isError) throw new Error(decodedOutput)
      setBalanceOf(output)

      const result2 = await contractQuery(api, contractAddress, contract, 'erc20::getName', {}, [])
      const {
        output: name,
        isError: isError2,
        decodedOutput: decodedOutput2,
      } = decodeOutput(result2, contract, 'erc20::getName')
      // console.log('Fetching Balance 2', result2, output2, isError2, decodedOutput2)
      if (isError2) throw new Error(decodedOutput2)
      setName(name)
    } catch (e) {
      toast.error('Error while fetching greeting. Try again…')
      setName(undefined)
      setBalanceOf(undefined)
    } finally {
      setFetchIsLoading(false)
    }
  }
  useEffect(() => {
    fetchToken()
  }, [contract, contractAddress, api, activeAccount])

  // Update Greeting
  const updateGreeting: SubmitHandler<z.infer<typeof formSchema>> = async ({ newMessage }) => {
    if (!activeAccount || !contract || !activeSigner || !api) {
      toast.error('Wallet not connected. Try again…')
      return
    }

    try {
      await contractTxWithToast(api, activeAccount.address, contract, 'setMessage', {}, [
        newMessage,
      ])
      reset()
    } catch (e) {
      console.error(e)
    } finally {
      fetchToken()
    }
  }

  if (!api) return null

  return (
    <>
      <div className="flex max-w-[22rem] grow flex-col gap-4">
        {activeAccount && (
          <h2 className="text-center font-mono text-gray-400">Fungible Token View</h2>
        )}

        <Form {...form}>
          {/* Fetched Greeting */}
          <Card>
            <CardContent className="pt-6">
              <FormItem>
                <FormLabel className="text-base">Token Name</FormLabel>
                <FormControl>
                  <Input
                    placeholder={fetchIsLoading || !contract ? 'Loading…' : name}
                    disabled={true}
                  />
                </FormControl>
              </FormItem>

              <FormItem>
                <FormLabel className="text-base">User Balance</FormLabel>
                <FormControl>
                  <Input
                    placeholder={fetchIsLoading || !contract ? 'Loading…' : balanceOf}
                    disabled={true}
                  />
                </FormControl>
              </FormItem>
            </CardContent>
          </Card>

          {/* Update Greeting */}
          {/* <Card>
            <CardContent className="pt-6">
              <form
                onSubmit={handleSubmit(updateGreeting)}
                className="flex flex-col justify-end gap-2"
              >
                <FormItem>
                  <FormLabel className="text-base">MINT</FormLabel>
                  <FormControl>
                    <div className="flex gap-2">
                      <Input disabled={form.formState.isSubmitting} {...register('newMessage')} />
                      <Button
                        type="submit"
                        className="bg-primary font-bold"
                        disabled={fetchIsLoading || form.formState.isSubmitting}
                        isLoading={form.formState.isSubmitting}
                      >
                        Submit
                      </Button>
                    </div>
                  </FormControl>
                </FormItem>
              </form>
            </CardContent>
          </Card> */}
        </Form>

        {/* Contract Address */}
        <p className="text-center font-mono text-xs text-gray-600">
          {contract ? contractAddress : 'Loading…'}
        </p>
      </div>
    </>
  )
}
