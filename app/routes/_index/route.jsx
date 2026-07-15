import { redirect, Form, useLoaderData } from "react-router";
import { login } from "../../shopify.server";
import styles from "./styles.module.css";

export const loader = async ({ request }) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <p className={styles.eyebrow}>Shopify loyalty app</p>
        <h1 className={styles.heading}>Loyalty Points Program</h1>
        <p className={styles.text}>
          Reward shoppers for every order, manage point balances, and turn
          repeat purchases into simple, trackable rewards.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>e.g: my-shop-domain.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </Form>
        )}
        <ul className={styles.list}>
          <li>
            <strong>Earn points</strong>. Automatically credit customers when
            eligible Shopify orders are paid.
          </li>
          <li>
            <strong>Redeem rewards</strong>. Let customers use their points for
            discounts or store credit rewards.
          </li>
          <li>
            <strong>Track activity</strong>. Review customers, balances, reward
            history, and program performance in one admin view.
          </li>
        </ul>
      </div>
    </div>
  );
}
