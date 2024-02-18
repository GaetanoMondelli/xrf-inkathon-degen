'use client'

import { FC, useEffect, useState } from 'react'

import { ContractIds } from '@/deployments/deployments'
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

import { Button } from '../ui/button'

const formSchema = z.object({
  newMessage: z.string().min(1).max(90),
})

export const ETFInteraction: FC = () => {
  const { api, activeAccount, activeSigner } = useInkathon()
  const { contract, address: contractAddress } = useRegisteredContract(ContractIds.ETF)
  const [name, setName] = useState<string>()
  const [balanceOf, setBalanceOf] = useState<string>()
  const [getRequiredTokens, setGetRequiredTokens] = useState<any>([])
  const [getRequiredBalances, setGetRequiredBalances] = useState<any>([])

  const [getVaultsNumber, setGetVaultsNumber] = useState<number>(0)
  const [getVaultsOfUser, setGetVaultsOfUser] = useState<number>(0)
  const [inputVaultNumber, setInputVaultNumber] = useState<number>()

  const [vaultOwnerQuery, setVaultOwnerQuery] = useState<number>(0)
  const [vaultOwnerQueryResult, setVaultOwnerQueryResult] = useState<string>()

  const [fetchIsLoading, setFetchIsLoading] = useState<boolean>()

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
  })

  const { register, reset, handleSubmit } = form

  const fetchInfo = async (
    methodName: any,
    args: any,
    setResult: any,
    errorResult: any = undefined,
  ) => {
    if (!contract || !api || typeof contractAddress !== 'string') return

    try {
      const result = await contractQuery(api, contractAddress, contract, methodName, {}, args)
      const { output, isError, decodedOutput } = decodeOutput(result, contract, methodName)
      if (isError) throw new Error(decodedOutput)
      setResult(output)
    } catch (e) {
      if (errorResult) setResult(errorResult)
      else {
        toast.error('Error while fetching greeting. Try again…')
        setResult(undefined)
      }
    }
  }

  // Fetch Greeting
  const fetchToken = async () => {
    if (!contract || !api || typeof contractAddress !== 'string') return

    setFetchIsLoading(true)
    try {
      fetchInfo('erc20::balanceOf', [activeAccount?.address || ''], setBalanceOf)

      fetchInfo('erc20::getName', [], setName)

      fetchInfo('getRequiredTokens', [], setGetRequiredTokens)

      fetchInfo('getRequiredBalances', [], setGetRequiredBalances)

      fetchInfo('getVaultsQuantity', [], setGetVaultsNumber)

      fetchInfo('getVaultsQuantityPerOwner', [activeAccount?.address || ''], setGetVaultsOfUser)
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

  useEffect(() => {
    if (contract && activeAccount) {
      fetchInfo('getVaultOwner', [vaultOwnerQuery], setVaultOwnerQueryResult, 'Empty')
    }
  }, [contract, contractAddress, api, activeAccount, vaultOwnerQuery])

  // Update Greeting
  const openVault: SubmitHandler<z.infer<typeof formSchema>> = async ({ newMessage }) => {
    console.log('openVault', newMessage, inputVaultNumber)
    if (!activeAccount || !contract || !activeSigner || !api) {
      toast.error('Wallet not connected. Try again…')
      return
    }
    console.log('openVault', newMessage, inputVaultNumber)
    // try {
    //   await contractTxWithToast(api, activeAccount.address, contract, 'openVault', {}, [newMessage])
    //   reset()
    // } catch (e) {
    //   console.error(e)
    // } finally {
    //   fetchToken()
    // }
  }

  const openVaultAction = async () => {
    if (!activeAccount || !contract || !activeSigner || !api) {
      toast.error('Wallet not connected. Try again…')
      return
    }
    console.log('openVault', inputVaultNumber)
    try {
      await contractTxWithToast(api, activeAccount.address, contract, 'openVault', {}, [
        inputVaultNumber,
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
        {activeAccount && <h2 className="text-center font-mono text-gray-400">ETF View</h2>}

        <Form {...form}>
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
              <br />

              <FormItem>
                <FormLabel className="text-base">User Shares of ETF</FormLabel>
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
          <Card>
            <CardContent className="pt-6">
              <form onSubmit={handleSubmit(openVault)} className="flex flex-col justify-end gap-2">
                <FormItem>
                  <FormLabel className="text-base">Vault Operations</FormLabel>
                  <FormControl>
                    <div className="flex gap-2">
                      <Input
                        defaultValue={0}
                        onChange={(e) => setInputVaultNumber(parseInt(e.target.value))}
                      />

                      <Button
                        // type="submit"
                        className="bg-primary font-bold"
                        // disabled={}
                        // isLoading={form.formState.isSubmitting}
                        onClick={openVaultAction}
                      >
                        Open Vault {inputVaultNumber}
                      </Button>
                    </div>
                  </FormControl>
                </FormItem>
              </form>
            </CardContent>
          </Card>
        </Form>

        {/* Contract Address */}
        <p className="text-center font-mono text-xs text-gray-600">
          {contract ? contractAddress : 'Loading…'}
        </p>
      </div>

      <div className="flex max-w-[22rem] grow flex-col gap-4">
        {activeAccount && <h2 className="text-center font-mono text-gray-400">Vault Stats</h2>}

        <Form {...form}>
          <Card>
            <CardContent className="pt-6">
              <FormItem>
                <FormLabel className="text-base">Required Tokens per vault</FormLabel>

                {getRequiredTokens.map((token: any, index: any) => {
                  return (
                    <FormControl key={index}>
                      <Input
                        placeholder={
                          // first 5 letters of the token and last 5 letters of the token
                          token.substring(0, 5) +
                          '...' +
                          token.substring(token.length - 5, token.length) +
                          ' : ' +
                          getRequiredBalances[index]
                        }
                        disabled={true}
                      />
                    </FormControl>
                  )
                })}
                {/* <FormControl>
                  <Input placeholder={getRequiredTokens} disabled={true} />
                </FormControl> */}
              </FormItem>
              <br />

              <FormItem>
                <FormLabel className="text-base">User Vaults / Total Vaults</FormLabel>
                <FormControl>
                  <Input
                    placeholder={
                      fetchIsLoading
                        ? 'Loading…'
                        : getVaultsOfUser.toString() + ' / ' + getVaultsNumber.toString() || ''
                    }
                    disabled={true}
                  />
                </FormControl>
              </FormItem>

              <br />

              <FormItem>
                <FormLabel className="text-base">Vault Inspector</FormLabel>
                <FormControl>
                  <div className="flex gap-0">
                    <Input
                      defaultValue={0}
                      onChange={(e) => setVaultOwnerQuery(parseInt(e.target.value))}
                    />
                    <Input
                      placeholder={
                        vaultOwnerQueryResult === 'Empty'
                          ? 'Vault not found'
                          : vaultOwnerQueryResult
                      }
                      disabled={true}
                    />
                  </div>
                </FormControl>
                <br />
                {vaultOwnerQueryResult === 'Empty' ? (
                  <p className="text-red-500">Vault not found</p>
                ) : (
                  <>
                    <p className="text-green-500">Vault Created</p>
                    <p>
                      Token A Balance:
                      <span className="text-green-500">{' ' + getRequiredBalances[0]}</span>
                    </p>
                    <p>
                      Token B Balance:
                      <span className="text-green-500">{' ' + getRequiredBalances[1]}</span>
                    </p>
                    <hr></hr>
                    <p>
                      ETF Shares Token minted:
                      <span className="text-green-500">{' 100'}</span>
                    </p>
                  </>
                )}
              </FormItem>
            </CardContent>
          </Card>
        </Form>
      </div>
    </>
  )
}
