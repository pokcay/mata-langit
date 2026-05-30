Rails.application.routes.draw do
  # Inbound email webhook — called by Cloudflare Worker, not browser-gated
  post "webhooks/inbound_email", to: "webhooks/inbound_emails#create"

  get  "login",  to: "sessions#new",     as: :login
  post "login",  to: "sessions#create"
  delete "logout", to: "sessions#destroy", as: :logout

  get  "signup", to: "registrations#new",    as: :signup
  post "signup", to: "registrations#create"

  resources :passwords, param: :token, only: %i[ new create edit update ]

  get "dashboard", to: "dashboard#show", as: :dashboard
  get   "settings", to: "settings#show",   as: :settings
  patch "settings", to: "settings#update"

  namespace :admin do
    root to: "dashboard#show"
    get "design-system", to: "design_system#show", as: :design_system
    resources :users, only: %i[ index show ]
    resources :email_templates, path: "email-templates", only: %i[ index show update ] do
      member do
        post :send_test
        post :reset_to_default
      end
    end
    resources :inbound_emails, path: "inbox", only: %i[ index show update ] do
      collection do
        patch :bulk_update
      end
    end

    namespace :timeseries do
      resources :uploads, only: %i[ index create destroy ] do
        collection do
          post   :preview
          delete :bulk_destroy
        end
        member { patch :cancel }
      end
    end

    namespace :master_outlet_dist, path: "master-outlet-dist" do
      resources :uploads, only: %i[ index create ] do
        collection { post :preview }
        member { patch :cancel }
      end
    end

    namespace :master_product_dist, path: "master-product-dist" do
      resources :uploads, only: %i[ index create ] do
        collection { post :preview }
        member { patch :cancel }
      end
    end

    namespace :trans_sellout_account, path: "trans-sellout-account" do
      resources :uploads, only: %i[ index create ] do
        collection { post :preview }
        member { patch :cancel }
      end
    end

    namespace :trans_sl_factory, path: "trans-sl-factory" do
      resources :uploads, only: %i[ index create ] do
        collection { post :preview }
        member { patch :cancel }
      end
    end

    namespace :master_rental, path: "master-rental" do
      resources :uploads, only: %i[ index create ] do
        collection { post :preview }
        member { patch :cancel }
      end
    end

    namespace :master_listing, path: "master-listing" do
      resources :uploads, only: %i[ index create ] do
        collection { post :preview }
        member { patch :cancel }
      end
    end

    namespace :market_share_b2b, path: "market-share-b2b" do
      resources :uploads, only: %i[ index create destroy ] do
        collection { post :preview }
        member { patch :cancel }
      end
    end

    get  "pivot/filter_values",    to: "pivot#filter_values",    as: :pivot_filter_values
    get  "pivot/catalog",          to: "pivot#catalog",           as: :pivot_catalog
    post "pivot/refresh_catalog",  to: "pivot#refresh_catalog",   as: :pivot_refresh_catalog
    get  "pivot",                  to: "pivot#show"
    post "pivot/generate",         to: "pivot#generate",          as: :pivot_generate
    post "pivot/export",           to: "pivot#export",            as: :pivot_export

    namespace :data do
      resources :integrity_checks, path: "integrity", only: %i[ index create show ] do
        member do
          patch :cancel
          patch :rerun
          get   :download
        end
      end

      namespace :ka_profitability, path: "ka-profitability" do
        resources :uploads, only: %i[ index create ] do
          collection { post :preview }
          member { patch :cancel }
        end
      end
    end
  end

  get   "profile",          to: "profiles#details",          as: :profile
  get   "profile/password", to: "profiles#password",         as: :profile_password
  patch "profile/email",    to: "profiles#update_email"
  patch "profile/password", to: "profiles#update_password"

  mount ActionCable.server => "/cable"
  mount LetterOpenerWeb::Engine, at: "/letter_opener" if Rails.env.development?

  get "up" => "rails/health#show", as: :rails_health_check

  root "pages#home"
end
