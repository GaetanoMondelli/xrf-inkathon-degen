#![cfg_attr(not(feature = "std"), no_std, no_main)]

#[ink::contract]
mod etf {

    use ink::env::{
        call::{build_call, ExecutionInput, Selector},
        DefaultEnvironment,
    };

    use ink::prelude::string::String;
    use ink::prelude::vec::Vec;
    use ink::storage::Mapping;

    // const shares per vault
    const SHARES: Balance = 100;
    const TRANSFER_FROM_SELECTOR: [u8; 4] = [0, 0, 0, 6];

    #[ink::trait_definition]
    pub trait Erc20 {
        #[ink(message)]
        fn get_name(&self) -> String;
        #[ink(message)]
        fn get_symbol(&self) -> String;
        #[ink(message)]
        fn balance_of(&self, owner: AccountId) -> Balance;
        #[ink(message)]
        fn total_supply(&self) -> Balance;
        #[ink(message)]
        fn transfer(&mut self, to: AccountId, value: Balance) -> Result<Balance, ContractError>;
        #[ink(message)]
        fn get_owner(&self) -> AccountId;
        #[ink(message, selector = 6)]
        fn transfer_from(
            &mut self,
            from: AccountId,
            to: AccountId,
            value: Balance,
        ) -> Result<Balance, ContractError>;
    }

    #[ink(event)]
    pub struct VaultOpened {
        #[ink(topic)]
        vault: u8,
        #[ink(topic)]
        owner: AccountId,
    }

    #[ink(event)]
    pub struct VaultClosed {
        #[ink(topic)]
        vault: u8,
        #[ink(topic)]
        owner: AccountId,
    }

    #[derive(Debug, Clone, scale::Encode, scale::Decode, PartialEq)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo))]
    pub enum ContractError {
        InsufficientBalance,
        UnsupportedToken,
        TransferFailed,
        CloseVaultFailed,
        VaultAlreadyExists,
    }

    #[ink(storage)]
    pub struct Etf {
        vaults_quantity: u8,
        required_tokens: Vec<AccountId>,
        required_balances: Vec<Balance>,
        vaults: Mapping<u8, AccountId>,
        vaults_quantity_per_owner: Mapping<AccountId, u8>,
        balances: Mapping<AccountId, Balance>,
        total_supply: Balance,
    }

    impl Etf {
        #[ink(constructor)]
        pub fn new(required_tokens: Vec<AccountId>, required_balances: Vec<Balance>) -> Self {
            Self {
                required_tokens,
                required_balances,
                vaults_quantity: 0,
                vaults_quantity_per_owner: Mapping::new(),
                balances: Mapping::new(),
                vaults: Mapping::new(),
                total_supply: 0,
            }
        }

        #[ink(message)]
        pub fn get_required_tokens(&self) -> Vec<AccountId> {
            self.required_tokens.clone()
        }

        #[ink(message)]
        pub fn get_required_balances(&self) -> Vec<Balance> {
            self.required_balances.clone()
        }

        #[ink(message)]
        pub fn get_vault_owner(&self, vault: u8) -> AccountId {
            self.vaults.get(&vault).unwrap()
        }

        #[ink(message)]
        pub fn get_vaults_quantity_per_owner(&self, owner: AccountId) -> u8 {
            self.vaults_quantity_per_owner.get(&owner).unwrap_or(0)
        }

        #[ink(message)]
        pub fn get_vaults_quantity(&self) -> u8 {
            self.vaults_quantity
        }

        #[ink(message)]
        pub fn get_balance(&self, owner: AccountId) -> Balance {
            self.balances.get(&owner).unwrap_or(0)
        }

        #[ink(message)]
        pub fn open_vault(&mut self, vault: u8) -> Result<u8, ContractError> {
            let caller = self.env().caller();

            if self.vaults.contains(&vault) {
                return Err(ContractError::VaultAlreadyExists);
            }

            for (i, token) in self.required_tokens.iter().enumerate() {
                let transfer_selector = Selector::new(TRANSFER_FROM_SELECTOR);
                let required_balance = self.required_balances[i];

                build_call::<DefaultEnvironment>()
                    .call(*token)
                    .gas_limit(0)
                    .transferred_value(0)
                    .exec_input(
                        ExecutionInput::new(transfer_selector)
                            .push_arg(caller)
                            .push_arg(self.env().account_id())
                            .push_arg(required_balance),
                    )
                    .returns::<()>()
                    .invoke();

                let escrow_balance = self.balances.get(token).unwrap_or(0);
                self.balances
                    .insert(token, &(escrow_balance + self.required_balances[i]));
            }

            let vault = self.vaults_quantity;
            self.vaults.insert(vault, &caller);
            self.vaults_quantity += 1;
            let vaults_quantity_of_caller =
                self.vaults_quantity_per_owner.get(&caller).unwrap_or(0);
            self.vaults_quantity_per_owner
                .insert(caller, &(vaults_quantity_of_caller + 1));

            // mint the etf tokens shares to the caller
            let caller_balance = self.balances.get(caller).unwrap_or(0);
            self.balances.insert(caller, &(caller_balance + SHARES));

            self.env().emit_event(VaultOpened { vault, owner: caller });
            Ok(vault)
        }

        #[ink(message)]
        pub fn close_vault(&mut self, vault: u8) -> Result<(), ContractError> {
            let caller = self.env().caller();
            let owner = self.vaults.get(&vault).unwrap();

            // check the vault has an owner, we do not care who is the owner
            if owner == &AccountId::default() {
                return Err(ContractError::CloseVaultFailed);
            }

            // check the caller has enough shares to close the vault and reedem the tokens
            let caller_shares_balance = self.balances.get(caller).unwrap_or(0);
            if caller_shares_balance < SHARES {
                return Err(ContractError::InsufficientBalance);
            }

            let _ = self
                .balances
                .insert(caller, &(caller_shares_balance - SHARES));
            let transfer_selector = Selector::new(TRANSFER_FROM_SELECTOR);

            for (i, token) in self.required_tokens.iter().enumerate() {
                // let balance = self.balances.get(token).unwrap_or(0);
                build_call::<DefaultEnvironment>()
                    .call(*token)
                    .gas_limit(0)
                    .transferred_value(0)
                    .exec_input(
                        ExecutionInput::new(transfer_selector)
                            .push_arg(self.env().account_id())
                            .push_arg(caller)
                            .push_arg(self.required_balances[i]),
                    )
                    .returns::<()>()
                    .invoke();

                let escrow_balance = self.balances.get(token).unwrap_or(0);
                self.balances
                    .insert(token, &(escrow_balance - self.required_balances[i]));
            }

            self.vaults.remove(&vault);
            let vaults_quantity_of_owner = self.vaults_quantity_per_owner.get(&owner).unwrap_or(0);
            self.vaults_quantity_per_owner
                .insert(owner, &(vaults_quantity_of_owner - 1));
            self.env().emit_event(VaultClosed { vault, owner });
            Ok(())
        }
    }

    impl Erc20 for Etf {
        #[ink(message)]
        fn get_name(&self) -> String {
            return String::from("X-ETF-INDEX-0");
        }

        #[ink(message)]
        fn get_symbol(&self) -> String {
            return String::from("XTF");
        }

        #[ink(message)]
        fn balance_of(&self, owner: AccountId) -> Balance {
            self.balances.get(&owner).unwrap_or(0)
        }

        #[ink(message)]
        fn total_supply(&self) -> Balance {
            self.total_supply
        }

        #[ink(message)]
        fn get_owner(&self) -> AccountId {
            //  to be implemented
            self.env().caller()
        }

        #[ink(message)]
        fn transfer(&mut self, to: AccountId, value: Balance) -> Result<Balance, ContractError> {
            let from = self.env().caller();
            let from_balance = self.balance_of(from);
            if from_balance < value {
                return Err(ContractError::InsufficientBalance);
            }
            let to_balance = self.balance_of(to);

            self.balances.insert(from, &(from_balance - value));
            self.balances.insert(to, &(to_balance + value));

            Ok(self.balance_of(from))
        }

        #[ink(message, selector = 6)]
        fn transfer_from(
            &mut self,
            from: AccountId,
            to: AccountId,
            value: Balance,
        ) -> Result<Balance, ContractError> {
            // let caller = self.env().caller();
            // TO-DO: need to check if the caller is allowed to transfer from `from`

            let from_balance = self.balance_of(from);
            if from_balance < value {
                return Err(ContractError::InsufficientBalance);
            }
            let to_balance = self.balance_of(to);

            self.balances.insert(from, &(from_balance - value));
            self.balances.insert(to, &(to_balance + value));

            Ok(self.balance_of(from))
        }
    }
}
