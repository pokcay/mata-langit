Rails.application.routes.draw do
  get  "login",  to: "sessions#new",     as: :login
  post "login",  to: "sessions#create"
  delete "logout", to: "sessions#destroy", as: :logout

  get  "signup", to: "registrations#new",    as: :signup
  post "signup", to: "registrations#create"

  resources :passwords, param: :token, only: %i[ new create edit update ]

  get "dashboard", to: "dashboard#show", as: :dashboard
  get "settings",  to: "settings#show",  as: :settings

  get   "profile",          to: "profiles#show",             as: :profile
  patch "profile/email",    to: "profiles#update_email",     as: :profile_email
  patch "profile/password", to: "profiles#update_password",  as: :profile_password

  mount LetterOpenerWeb::Engine, at: "/letter_opener" if Rails.env.development?

  get "up" => "rails/health#show", as: :rails_health_check

  root "pages#home"
end
